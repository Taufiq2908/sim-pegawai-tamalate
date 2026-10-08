import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { availableActions, calcDays, NEXT_PERMISSION, TRANSITIONS } from '../services/leave.service';
import { ok, fail } from '../utils/response';
import { canAny, usersForPermission } from '../lib/permissions';
import { resolveSupervisor, skipsReviewer } from '../services/supervisor.service';

const router = Router();
router.use(authRequired);

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: env.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

async function toDetail(r: any, perms: string[]) {
  const supervisor = r.employee
    ? await resolveSupervisor({ position: r.employee.position, orgUnit: r.employee.orgUnit ?? null })
    : null;
  return {
    ...r,
    availableActions: availableActions(r.status, perms),
    supervisor,
    documents: (r.documents ?? []).map((d: any) => ({
      id: d.id,
      docType: d.docType,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      downloadUrl: `/api/v1/leave-requests/${r.id}/documents/${d.id}/download`,
    })),
    // Persetujuan digital (fase 1, bukan TTE): nama+NIP+jabatan+waktu per aksi.
    timeline: (r.approvals ?? []).map((a: any) => ({
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      actor: `${a.actorName ?? a.actor?.username ?? '?'} (${a.actorRole}${a.actorPosition ? '/' + a.actorPosition : ''})`,
      actorName: a.actorName ?? a.actor?.username ?? null,
      actorNip: a.actorNip ?? null,
      actorRole: a.actorRole,
      actorPosition: a.actorPosition,
      note: a.note,
      createdAt: a.createdAt,
    })),
  };
}

const ACTION_LABEL_ID: Record<string, string> = {
  submit: 'diajukan', review: 'diberi pertimbangan atasan', verify: 'diverifikasi',
  revise: 'diminta revisi', postpone: 'ditangguhkan', paraf: 'diparaf',
  approve: 'disetujui', sign: 'ditandatangani', register: 'diregistrasi',
  tobkpsdm: 'diteruskan ke BKPSDM', receiveresult: 'diterima hasilnya',
  complete: 'diselesaikan', archive: 'diarsipkan', forward: 'diteruskan ke Sekda',
  reject: 'ditolak',
};

// Notifikasi tiap transisi cuti (B8): pemegang tahap berikut + pemohon.
// Best-effort: kegagalan notifikasi tidak menggagalkan aksi.
async function notifyLeaveTransition(opts: {
  requestId: string; requestNumber: string; employeeId: string;
  action: string; fromStatus: string; toStatus: string;
  actorId: string; actorName: string; actorPosition: string | null; note?: string | null;
}) {
  try {
    const ids = new Set<string>();
    const next = NEXT_PERMISSION[opts.action];
    if (next) {
      for (const id of await usersForPermission(next)) ids.add(id);
    }
    const applicantUser = await prisma.user.findFirst({
      where: { employeeId: opts.employeeId, isActive: true },
      select: { id: true },
    });
    if (applicantUser && applicantUser.id !== opts.actorId) ids.add(applicantUser.id);
    ids.delete(opts.actorId);
    if (!ids.size) return;
    const label = ACTION_LABEL_ID[opts.action] ?? opts.action;
    await prisma.notification.createMany({
      data: [...ids].map((userId) => ({
        userId,
        type: 'LEAVE',
        title: `Cuti ${opts.requestNumber} ${label}`,
        body: `${opts.actorName}${opts.actorPosition ? ` (${opts.actorPosition})` : ''}: ${opts.fromStatus} → ${opts.toStatus}${opts.note ? ` — ${opts.note}` : ''}`,
        referenceType: 'leave_request',
        referenceId: opts.requestId,
      })),
    });
  } catch (e) {
    console.error('notify cuti gagal:', (e as Error).message);
  }
}

const includeDetail = {
  employee: { include: { orgUnit: true } },
  leaveType: true,
  documents: true,
  approvals: { include: { actor: { omit: { passwordHash: true } } }, orderBy: { createdAt: 'asc' as const } },
};

// GET /leave-requests
router.get('/', requirePermission('leave.view'), async (req, res) => {
  const { status, page = '1', limit = '10', q, leaveType, unit, startFrom, startTo } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (leaveType) where.leaveType = { code: String(leaveType) };
  if (unit) where.employee = { ...(where.employee ?? {}), orgUnit: { code: String(unit) } };
  if (startFrom || startTo) {
    where.startDate = {};
    if (startFrom) where.startDate.gte = new Date(String(startFrom));
    if (startTo) where.startDate.lte = new Date(String(startTo));
  }
  if (q) {
    const s = String(q);
    where.OR = [
      { employee: { name: { contains: s, mode: 'insensitive' } } },
      { employee: { nip: { contains: s, mode: 'insensitive' } } },
      { requestNumber: { contains: s, mode: 'insensitive' } },
    ];
  }
  // EMPLOYEE hanya miliknya
  if (req.user!.role === 'EMPLOYEE' && req.user!.employeeId) {
    where.employeeId = req.user!.employeeId;
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      include: { employee: { include: { orgUnit: true } }, leaveType: true },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// GET /leave-requests/:id
router.get('/:id', requirePermission('leave.view'), async (req, res) => {
  const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id }, include: includeDetail });
  if (!r) return fail(res, 404, 'Pengajuan cuti tidak ditemukan');
  if (req.user!.role === 'EMPLOYEE' && req.user!.employeeId && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya boleh melihat pengajuan sendiri');
  }
  return ok(res, await toDetail(r, req.user!.permissions));
});

// POST /leave-requests (DRAFT)
router.post('/', requirePermission('leave.create'), async (req, res) => {
  const schema = z.object({
    leaveTypeCode: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(5),
    addressDuringLeave: z.string().optional(),
    contactDuringLeave: z.string().optional(),
    employeeId: z.string().uuid().optional(), // hanya non-EMPLOYEE (admin input untuk orang lain)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  let employeeId = req.user!.employeeId;
  if (b.employeeId) {
    if (req.user!.role === 'EMPLOYEE') return fail(res, 403, 'Tidak boleh membuat untuk orang lain');
    employeeId = b.employeeId;
  }
  if (!employeeId) return fail(res, 422, 'User ini tidak terhubung ke data employee');

  const leaveType = await prisma.leaveType.findUnique({ where: { code: b.leaveTypeCode } });
  if (!leaveType || !leaveType.isActive) return fail(res, 422, 'Jenis cuti tidak valid');
  const start = new Date(b.startDate);
  const end = new Date(b.endDate);
  if (end < start) return fail(res, 422, 'endDate harus >= startDate');

  const count = await prisma.leaveRequest.count();
  const requestNumber = `CUTI-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  const r = await prisma.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        requestNumber,
        employeeId: employeeId!,
        leaveTypeId: leaveType.id,
        startDate: start,
        endDate: end,
        totalDays: calcDays(start, end),
        reason: b.reason,
        addressDuringLeave: b.addressDuringLeave,
        contactDuringLeave: b.contactDuringLeave,
        status: 'DRAFT',
        currentHolderRole: 'EMPLOYEE',
        createdBy: req.user!.id,
      },
      include: includeDetail,
    });
    await tx.leaveApproval.create({
      data: {
        leaveRequestId: created.id,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        actorPosition: req.user!.position,
        fromStatus: '-',
        toStatus: 'DRAFT',
        action: 'CREATE',
      },
    });
    return created;
  });
  const full = await prisma.leaveRequest.findUnique({ where: { id: r.id }, include: includeDetail });
  return res.status(201).json({ success: true, message: 'Draf cuti dibuat', data: await toDetail(full, req.user!.permissions), meta: null, errors: null });
});

// PATCH /leave-requests/:id (DRAFT/REVISION, pemilik)
router.patch('/:id', requirePermission('leave.create'), async (req, res) => {
  const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(r.status)) return fail(res, 409, `Hanya DRAFT/REVISION yang bisa diubah (saat ini ${r.status})`);
  if (req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) return fail(res, 403, 'Bukan milikmu');
  const schema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().min(5).optional(),
    addressDuringLeave: z.string().optional(),
    contactDuringLeave: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const start = parsed.data.startDate ? new Date(parsed.data.startDate) : r.startDate;
  const end = parsed.data.endDate ? new Date(parsed.data.endDate) : r.endDate;
  if (end < start) return fail(res, 422, 'endDate harus >= startDate');
  const updated = await prisma.leaveRequest.update({
    where: { id: r.id },
    data: { ...parsed.data, startDate: start, endDate: end, totalDays: calcDays(start, end) },
    include: includeDetail,
  });
  return ok(res, await toDetail(updated, req.user!.permissions));
});

// POST /leave-requests/:id/documents
router.post('/:id/documents', requirePermission('leave.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const file = (req as any).file;
    const { docType = 'LAINNYA' } = req.body ?? {};
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!r) return fail(res, 404, 'Tidak ditemukan');
    if (!['DRAFT', 'REVISION'].includes(r.status)) return fail(res, 409, 'Upload hanya saat DRAFT/REVISION');
    if (req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) return fail(res, 403, 'Bukan milikmu');
    const ext = path.extname(file.originalname);
    const storedPath = file.path + ext;
    fs.renameSync(file.path, storedPath);
    const doc = await prisma.leaveDocument.create({
      data: {
        leaveRequestId: r.id,
        docType: String(docType),
        originalName: file.originalname,
        storedPath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: req.user!.id,
      },
    });
    return res.status(201).json({ success: true, message: 'Dokumen diupload', data: doc, meta: null, errors: null });
  });
});

// GET download
router.get('/:id/documents/:docId/download', requirePermission('leave.view'), async (req, res) => {
  const doc = await prisma.leaveDocument.findFirst({
    where: { id: req.params.docId, leaveRequestId: req.params.id },
  });
  if (!doc || !fs.existsSync(doc.storedPath)) return fail(res, 404, 'Dokumen tidak ditemukan');
  return res.download(doc.storedPath, doc.originalName);
});

// POST /leave-requests/:id/answer-letter (B1: surat jawaban BKPSDM)
// Multipart file; docType otomatis SURAT_JAWABAN_BKPSDM. Status tetap.
// Hanya saat APPROVED/SIGNED, diunggah pelaksana (bukan pemohon).
// (Didefinisikan SEBELUM /:id/:action agar tidak tertangkap action generik.)
router.post('/:id/answer-letter', requirePermission('leave.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const file = (req as any).file;
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!r) return fail(res, 404, 'Tidak ditemukan');
    if (!['APPROVED', 'SIGNED'].includes(r.status)) {
      return fail(res, 409, `Surat jawaban hanya dicatat saat APPROVED/SIGNED (saat ini ${r.status})`);
    }
    if (req.user!.employeeId && r.employeeId === req.user!.employeeId && req.user!.role === 'EMPLOYEE') {
      return fail(res, 403, 'Surat jawaban diunggah pelaksana, bukan pemohon');
    }
    const ext = path.extname(file.originalname);
    const storedPath = file.path + ext;
    fs.renameSync(file.path, storedPath);
    const doc = await prisma.leaveDocument.create({
      data: {
        leaveRequestId: r.id,
        docType: 'SURAT_JAWABAN_BKPSDM',
        originalName: file.originalname,
        storedPath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: req.user!.id,
      },
    });
    return res.status(201).json({ success: true, message: 'Surat jawaban BKPSDM dicatat', data: doc, meta: null, errors: null });
  });
});

// POST /leave-requests/:id/:action
// (submit/review/verify/revise/postpone/paraf/approve/sign/register/tobkpsdm/receiveresult/complete/archive/forward/reject)
router.post('/:id/:action', async (req, res) => {
  const { action } = req.params;
  const t = TRANSITIONS[action];
  if (!t) return fail(res, 404, `Action tidak dikenal: ${action}`);
  if (!canAny(req.user!.permissions, t.permissions)) {
    return fail(res, 403, `Forbidden: butuh salah satu permission ${t.permissions.join('/')}`);
  }

  const schema = z.object({ note: z.string().optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const note = parsed.data.note;
  if ((action === 'revise' || action === 'reject' || action === 'postpone') && !note) {
    return fail(res, 422, 'note wajib untuk revise/reject/postpone');
  }

  const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  // Siapa pun (termasuk Camat/Super Admin) tidak boleh memproses pengajuan sendiri.
  if (action !== 'submit' && r.createdBy === req.user!.id) {
    return fail(res, 403, 'Tidak boleh memproses pengajuan sendiri');
  }
  if (!t.from.includes(r.status)) {
    return fail(res, 409, `Status harus ${t.from.join('/')} , saat ini ${r.status}`);
  }
  // Data pemohon (dibutuhkan untuk exception jabatan + asal unit).
  const applicant = await prisma.employee.findUnique({
    where: { id: r.employeeId },
    include: { orgUnit: true },
  });
  if (!applicant) return fail(res, 422, 'Data pegawai pemohon tidak ditemukan');
  const skipReview = skipsReviewer(applicant.position, applicant.orgUnit?.type ?? null);
  const has = (p: string) => canAny(req.user!.permissions, [p]);

  // Tahap atasan (B4): pertimbangan hanya oleh atasan langsung yang terpetakan.
  // Pemohon yang melewati REVIEWED (Camat/Sekcam/Lurah/kelurahan) tidak bisa di-review.
  async function directOnly(): Promise<string | null> {
    const sup = await resolveSupervisor({ position: applicant!.position, orgUnit: applicant!.orgUnit });
    if (!sup.direct) return null; // tak terpetakan → siapa pun berpermisi boleh
    if (sup.direct.id !== req.user!.id) {
      return `Hanya atasan langsung (${sup.direct.name}, ${sup.direct.position ?? '-'}) yang dapat memberi pertimbangan`;
    }
    return null;
  }
  if (action === 'review') {
    if (skipReview) return fail(res, 422, 'Pengajuan ini tidak melalui pertimbangan atasan (langsung verifikasi/forward)');
    const msg = await directOnly();
    if (msg) return fail(res, 403, msg);
  }
  // Verifikasi Kasubag: normal dari REVIEWED; dari SUBMITTED hanya untuk
  // pemohon yang melewati REVIEWED.
  if (action === 'verify' && r.status === 'SUBMITTED' && !skipReview) {
    return fail(res, 422, 'Menunggu pertimbangan atasan langsung (REVIEWED) lebih dulu');
  }
  // Minta revisi: atasan saat SUBMITTED, Kasubag saat REVIEWED
  // (atau dari SUBMITTED untuk pemohon yang melewati REVIEWED).
  if (action === 'revise') {
    if (r.status === 'SUBMITTED') {
      if (skipReview) {
        if (!has('leave.verify')) return fail(res, 403, 'Forbidden: butuh permission leave.verify');
      } else if (has('leave.review')) {
        const msg = await directOnly();
        if (msg) return fail(res, 403, msg);
      } else {
        return fail(res, 422, 'Revisi saat SUBMITTED adalah wewenang atasan langsung');
      }
    } else if (!has('leave.verify')) {
      return fail(res, 403, 'Forbidden: butuh permission leave.verify');
    }
  }
  // Penangguhan (B5, DITANGGUHKAN): wewenang mengikuti tahap berjalan.
  if (action === 'postpone') {
    if (r.status === 'SUBMITTED') {
      if (skipReview) {
        if (!has('leave.verify') && !has('leave.reject')) return fail(res, 403, 'Forbidden: butuh permission leave.verify/leave.reject');
      } else if (has('leave.review')) {
        const msg = await directOnly();
        if (msg) return fail(res, 403, msg);
      } else {
        return fail(res, 422, 'Penangguhan saat SUBMITTED adalah wewenang atasan langsung');
      }
    } else if (r.status === 'REVIEWED' || r.status === 'VERIFIED') {
      if (!has('leave.verify')) return fail(res, 403, 'Forbidden: butuh permission leave.verify');
    } else if (!has('leave.reject')) {
      return fail(res, 403, 'Forbidden: butuh permission leave.reject');
    }
  }
  // Penolakan: atasan (TIDAK DISETUJUI) saat SUBMITTED, selebihnya leave.reject.
  if (action === 'reject' && r.status === 'SUBMITTED') {
    if (skipReview) {
      if (!has('leave.reject')) return fail(res, 403, 'Forbidden: butuh permission leave.reject');
    } else if (has('leave.review')) {
      const msg = await directOnly();
      if (msg) return fail(res, 403, msg);
    } else {
      return fail(res, 422, 'Penolakan saat SUBMITTED adalah wewenang atasan langsung');
    }
  }
  // Lompat-paraf: approve langsung dari VERIFIED hanya untuk pemohon SEKCAM.
  // Pemohon lain wajib lewat PARAF. Paraf untuk pemohon SEKCAM ditolak.
  if (action === 'approve' && r.status === 'VERIFIED' && applicant?.position !== 'SEKCAM') {
    return fail(res, 422, 'Persetujuan harus dari PARAF (kecuali pemohon Sekcam)');
  }
  if (action === 'paraf' && applicant?.position === 'SEKCAM') {
    return fail(res, 422, 'Pengajuan Sekcam langsung ke Camat tanpa paraf Sekcam');
  }
  // Ekor BKPSDMD + arsip hanya boleh dijalankan staf kecamatan
  // (pemohon kelurahan tetap boleh mengajukan, tapi penerusan ke BKPSDMD oleh kecamatan).
  if (['register', 'tobkpsdm', 'receiveresult', 'archive'].includes(action) && req.user!.role !== 'SUPER_ADMIN') {
    const operatorOrg = req.user!.orgUnitId
      ? await prisma.organizationalUnit.findUnique({ where: { id: req.user!.orgUnitId } })
      : null;
    if (!operatorOrg || operatorOrg.code !== 'KEC-TAMALATE') {
      return fail(res, 403, 'Registrasi/penerusan BKPSDMD/arsip hanya oleh staf kecamatan');
    }
  }
  // Forward ke Sekda hanya untuk pengajuan Camat.
  if (action === 'forward') {
    if (applicant?.position !== 'CAMAT') {
      return fail(res, 422, 'Forward ke Sekda hanya untuk pengajuan Camat');
    }
    if (!note) return fail(res, 422, 'note wajib untuk forward (catat nomor/tanggal penerusan ke Sekda)');
  }
  // ownership untuk submit (termasuk pengajuan ulang dari POSTPONED)
  if (action === 'submit' && req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Bukan milikmu');
  }
  // Submit wajib melampirkan minimal 2 berkas, salah satunya SK terakhir.
  // Jenis yang requiresDocument (mis. SAKIT) wajib melampirkan SURAT_DOKTER.
  if (action === 'submit') {
    const docs = await prisma.leaveDocument.findMany({ where: { leaveRequestId: r.id }, select: { docType: true } });
    if (docs.length < 2 || !docs.some((d) => d.docType === 'SK_TERAKHIR')) {
      return fail(res, 422, 'Berkas belum lengkap: wajib ≥2 dokumen termasuk SK_TERAKHIR (mis. + SURAT_CUTI_SEBELUMNYA/FORM_CUTI)');
    }
    const lt = await prisma.leaveType.findUnique({ where: { id: r.leaveTypeId } });
    if (lt?.requiresDocument && !docs.some((d) => d.docType === 'SURAT_DOKTER')) {
      return fail(res, 422, `Jenis ${lt.name} wajib melampirkan SURAT_DOKTER`);
    }
  }
  // SIGNED = jawaban BKPSDM sudah dicatat (B1, penghambat alur).
  if (action === 'sign') {
    const ans = await prisma.leaveDocument.count({ where: { leaveRequestId: r.id, docType: 'SURAT_JAWABAN_BKPSDM' } });
    if (!ans) {
      return fail(res, 422, 'Belum ada surat jawaban BKPSDM — catat dulu via POST /leave-requests/:id/answer-letter');
    }
  }
  // Snapshot persetujuan digital (B11): nama + NIP + jabatan + waktu.
  const actorFull = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { employee: true } });

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.leaveRequest.update({
      where: { id: r.id },
      data: {
        status: t.to,
        submittedAt: action === 'submit' ? new Date() : r.submittedAt,
        revisionNote: action === 'revise' ? note : null,
        rejectionReason: action === 'reject' ? note : null,
        postponeNote: action === 'postpone' ? note : null,
        currentHolderRole: t.holderAfter,
      },
    });
    await tx.leaveApproval.create({
      data: {
        leaveRequestId: r.id,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        actorPosition: req.user!.position,
        actorName: actorFull?.employee?.name ?? actorFull?.username ?? null,
        actorNip: actorFull?.employee?.nip ?? null,
        fromStatus: r.status,
        toStatus: t.to,
        action: action.toUpperCase(),
        note: note ?? null,
      },
    });
    return u;
  });

  await notifyLeaveTransition({
    requestId: r.id, requestNumber: r.requestNumber, employeeId: r.employeeId,
    action, fromStatus: r.status, toStatus: t.to,
    actorId: req.user!.id, actorName: actorFull?.employee?.name ?? req.user!.username,
    actorPosition: req.user!.position, note,
  });

  const full = await prisma.leaveRequest.findUnique({ where: { id: updated.id }, include: includeDetail });
  return ok(res, await toDetail(full, req.user!.permissions), `${action} berhasil`);
});

// DELETE /leave-requests/:id — hapus DRAFT milik sendiri (tidak ada hapus untuk status lain).
router.delete('/:id', requirePermission('leave.view'), async (req, res) => {
  const r = await prisma.leaveRequest.findUnique({
    where: { id: req.params.id },
    include: { documents: true },
  });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  if (r.status !== 'DRAFT') return fail(res, 409, `Hanya DRAFT yang bisa dihapus (saat ini ${r.status})`);
  if (req.user!.role !== 'SUPER_ADMIN' && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya pemilik draf (atau superadmin) yang boleh menghapus');
  }
  await prisma.$transaction(async (tx) => {
    await tx.leaveApproval.deleteMany({ where: { leaveRequestId: r.id } });
    await tx.leaveDocument.deleteMany({ where: { leaveRequestId: r.id } });
    await tx.leaveRequest.delete({ where: { id: r.id } });
  });
  for (const d of r.documents) {
    try { fs.rmSync(d.storedPath, { force: true }); } catch { /* best-effort */ }
  }
  return ok(res, null, 'Draf dihapus');
});

export default router;
