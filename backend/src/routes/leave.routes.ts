import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { deleteStoredFile, hashFileAtPath, sendStoredFile, storeUploadedFile } from '../lib/storage';
import { authRequired, requirePermission } from '../middleware/auth';
import { availableActions, calcDays, NEXT_PERMISSION, NEXT_POSITION, TRANSITIONS, waitingFor } from '../services/leave.service';
import { ok, fail } from '../utils/response';
import { canAny, usersForPermission } from '../lib/permissions';
import { resolveSupervisor, skipsReviewer } from '../services/supervisor.service';
import { effectivePosition, hasPosition, normalizePosition, positionLabel, primaryUserForPosition, userIdsForPosition, userHoldsPosition } from '../services/position.service';
import { hashDocument, leaveDocumentPayload, listParafHistory, publicParafHistory, recordParaf } from '../services/paraf.service';

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

async function toDetail(
  r: any,
  user: { id: string; permissions: string[]; employeeId: string | null; position: string | null; role: string },
) {
  const supervisor = r.employee
    ? await resolveSupervisor({ position: r.employee.position, orgUnit: r.employee.orgUnit ?? null })
    : null;
  const [camat, holdsSekcam, holdsCamat, documents, parafHistory] = await Promise.all([
    primaryUserForPosition('CAMAT'),
    userHoldsPosition(user.id, 'SEKCAM'),
    userHoldsPosition(user.id, 'CAMAT'),
    Promise.resolve(r.documents ?? []),
    listParafHistory('LEAVE', r.id),
  ]);
  const applicant = r.employee
    ? { position: r.employee.position ?? null, orgType: r.employee.orgUnit?.type ?? null }
    : null;
  const camatPosition = camat
    ? await effectivePosition(camat.id, camat.position, 'CAMAT')
    : null;
  const currentDocumentHash = hashDocument(leaveDocumentPayload(r, documents));
  return {
    ...r,
    waitingFor: waitingFor(
      r.status,
      r.employee?.position ?? null,
      r.employee?.orgUnit?.type ?? null,
    ),
    documentVersion: r.version ?? 1,
    currentDocumentHash,
    availableActions: availableActions(r.status, user.permissions, applicant, {
      isOwner: r.employeeId === user.employeeId,
      actorPosition: user.position,
      actorRole: user.role,
      holdsSekcam,
      holdsCamat,
    }),
    supervisor,
    camat: camat
      ? {
          name: camat.employee?.name ?? camat.username,
          nip: camat.employee?.nip ?? null,
          position: positionLabel(camatPosition) ?? 'CAMAT',
        }
      : null,
    documents: documents.map((d: any) => ({
      id: d.id,
      docType: d.docType,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      contentHash: d.contentHash ?? null,
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
    // Jejak paraf append-only: versi + hash dokumen yang diparaf.
    parafHistory: publicParafHistory(parafHistory),
  };
}

const ACTION_LABEL_ID: Record<string, string> = {
  submit: 'diajukan', review: 'diberi pertimbangan atasan', verify: 'diverifikasi',
  revise: 'diminta revisi', postpone: 'ditangguhkan', paraf: 'diparaf',
  approve: 'disetujui', register: 'diregistrasi',
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
  /** true bila pemohon melewati tahap REVIEWED. */
  skipReview?: boolean;
  /** Jabatan pemohon, dipakai untuk lompat-paraf khusus pemohon Sekcam. */
  applicantPosition?: string | null;
}) {
  try {
    const ids = new Set<string>();
    const nextPosition = opts.action === 'verify' && hasPosition(opts.applicantPosition, 'SEKCAM')
      ? 'CAMAT'
      : NEXT_POSITION[opts.action];
    if (nextPosition) {
      // Penerima utama ditentukan jabatan (termasuk Plt), bukan permission
      // yang bisa dipegang beberapa jabatan sekaligus.
      for (const id of await userIdsForPosition(nextPosition)) ids.add(id);
    } else {
      // Pemohon yang melewati REVIEWED langsung menuju Kasubag.
      const next = opts.action === 'submit' && opts.skipReview
        ? 'leave.verify'
        : NEXT_PERMISSION[opts.action];
      if (next) {
        for (const id of await usersForPermission(next)) ids.add(id);
      }
    }
    const applicantUser = await prisma.user.findFirst({
      where: { employeeId: opts.employeeId, isActive: true },
      select: { id: true },
    });
    if (applicantUser) ids.add(applicantUser.id);
    ids.delete(opts.actorId);
    if (!ids.size) {
      console.warn(`notify cuti: tidak ada penerima untuk ${opts.requestNumber} (${opts.action})`);
      return;
    }
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
  return ok(
    res,
    items.map((item) => ({
      ...item,
      waitingFor: waitingFor(
        item.status,
        item.employee?.position ?? null,
        item.employee?.orgUnit?.type ?? null,
      ),
    })),
    'ok',
    { page: p, limit: l, total },
  );
});

// GET /leave-requests/pending-approval — daftar tugas berdasarkan jabatan/permission.
// Endpoint ini menjadi sumber badge "Menunggu persetujuan saya"; tidak
// bergantung pada notifikasi yang mungkin gagal terkirim.
router.get('/pending-approval', requirePermission('leave.view'), async (req, res) => {
  const user = req.user!;
  const statuses = new Set<string>();
  const holdsSekcam = await userHoldsPosition(user.id, 'SEKCAM');
  const holdsCamat = await userHoldsPosition(user.id, 'CAMAT');
  if (user.role === 'SUPER_ADMIN') {
    for (const s of ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF', 'APPROVED']) statuses.add(s);
  }
  if (user.permissions.includes('leave.verify')) {
    statuses.add('REVIEWED');
    // SUBMITTED hanya tugas Kasubag bila pemohon melewati REVIEWED.
    statuses.add('SUBMITTED');
  }
  if (canAny(user.permissions, ['leave.paraf']) && holdsSekcam) statuses.add('VERIFIED');
  if (canAny(user.permissions, ['leave.approve']) && holdsCamat) {
    statuses.add('PARAF');
    // Pemohon Sekcam melewati paraf dan sudah menunggu Camat pada VERIFIED.
    statuses.add('VERIFIED');
  }
  if (canAny(user.permissions, ['leave.register'])) statuses.add('APPROVED');
  if (!statuses.size) return ok(res, [], 'ok', { total: 0, count: 0 });

  const items = await prisma.leaveRequest.findMany({
    where: {
      status: { in: [...statuses] },
      // Jangan tampilkan pengajuan sendiri sebagai tugas persetujuan sendiri.
      ...(user.employeeId ? { employeeId: { not: user.employeeId } } : {}),
    },
    include: { employee: { include: { orgUnit: true } }, leaveType: true },
    orderBy: { createdAt: 'asc' },
  });
  const visible = items.filter((item) => {
    if (item.status === 'SUBMITTED' && user.role !== 'SUPER_ADMIN') {
      return skipsReviewer(item.employee?.position ?? null, item.employee?.orgUnit?.type ?? null);
    }
    // Camat hanya menangani VERIFIED untuk pemohon Sekcam (lompat-paraf).
    if (item.status === 'VERIFIED' && holdsCamat && !holdsSekcam) {
      return hasPosition(item.employee?.position ?? null, 'SEKCAM');
    }
    // Sekcam tidak menangani VERIFIED pemohon Sekcam karena paraf dilewati.
    if (item.status === 'VERIFIED' && holdsSekcam && !holdsCamat) {
      return !hasPosition(item.employee?.position ?? null, 'SEKCAM');
    }
    return true;
  });
  return ok(
    res,
    visible.map((item) => ({
      ...item,
      waitingFor: waitingFor(
        item.status,
        item.employee?.position ?? null,
        item.employee?.orgUnit?.type ?? null,
      ),
    })),
    'ok',
    { total: visible.length, count: visible.length },
  );
});

// GET /leave-requests/:id
router.get('/:id', requirePermission('leave.view'), async (req, res) => {
  const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id }, include: includeDetail });
  if (!r) return fail(res, 404, 'Pengajuan cuti tidak ditemukan');
  if (req.user!.role === 'EMPLOYEE' && req.user!.employeeId && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya boleh melihat pengajuan sendiri');
  }
  return ok(res, await toDetail(r, req.user!));
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
    // Dipertahankan untuk kompatibilitas. Nilainya wajib sama dengan employee user login.
    employeeId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  // Policy: semua role hanya boleh membuat cuti untuk dirinya sendiri.
  // Cek ini tetap dilakukan di route karena SUPER_ADMIN punya bypass permission '*'.
  if (b.employeeId && b.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya boleh membuat cuti untuk diri sendiri');
  }
  const employeeId = req.user!.employeeId;
  if (!employeeId) return fail(res, 422, 'User ini tidak terhubung ke data employee');

  const leaveType = await prisma.leaveType.findUnique({ where: { code: b.leaveTypeCode } });
  if (!leaveType || !leaveType.isActive) return fail(res, 422, 'Jenis cuti tidak valid');
  const start = new Date(b.startDate);
  const end = new Date(b.endDate);
  if (end < start) return fail(res, 422, 'endDate harus >= startDate');

  // Nomor berurut per tahun dari nomor terbesar yang ada (tahan terhadap hapus data).
  const year = new Date().getFullYear();
  const last = await prisma.leaveRequest.findFirst({
    where: { requestNumber: { startsWith: `CUTI-${year}-` } },
    orderBy: { requestNumber: 'desc' },
  });
  const seq = last ? Number(last.requestNumber.slice(-4)) + 1 : 1;
  const requestNumber = `CUTI-${year}-${String(seq).padStart(4, '0')}`;

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
  return res.status(201).json({ success: true, message: 'Draf cuti dibuat', data: await toDetail(full, req.user!), meta: null, errors: null });
});

// PATCH /leave-requests/:id (DRAFT/REVISION, pemilik)
router.patch('/:id', requirePermission('leave.create'), async (req, res) => {
  const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  // Policy: hanya pemilik draft (employee yang sama), berlaku untuk semua role.
  // Cek ownership sebelum status agar non-pemilik selalu mendapat 403.
  if (r.employeeId !== req.user!.employeeId) return fail(res, 403, 'Hanya pemilik draft yang boleh mengubah');
  if (!['DRAFT', 'REVISION'].includes(r.status)) return fail(res, 409, `Hanya DRAFT/REVISION yang bisa diubah (saat ini ${r.status})`);
  const schema = z.object({
    leaveTypeCode: z.string().min(1).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().min(5).optional(),
    addressDuringLeave: z.string().optional(),
    contactDuringLeave: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const { leaveTypeCode, ...rest } = parsed.data;
  let leaveTypeId: string | undefined;
  if (leaveTypeCode) {
    const leaveType = await prisma.leaveType.findUnique({ where: { code: leaveTypeCode } });
    if (!leaveType || !leaveType.isActive) return fail(res, 422, 'Jenis cuti tidak valid');
    leaveTypeId = leaveType.id;
  }
  const start = parsed.data.startDate ? new Date(parsed.data.startDate) : r.startDate;
  const end = parsed.data.endDate ? new Date(parsed.data.endDate) : r.endDate;
  if (end < start) return fail(res, 422, 'endDate harus >= startDate');
  const updated = await prisma.leaveRequest.update({
    where: { id: r.id },
    data: {
      ...rest,
      ...(leaveTypeId ? { leaveTypeId } : {}),
      startDate: start,
      endDate: end,
      totalDays: calcDays(start, end),
    },
    include: includeDetail,
  });
  return ok(res, await toDetail(updated, req.user!));
});

// POST /leave-requests/:id/documents
router.post('/:id/documents', requirePermission('leave.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const file = (req as any).file;
    const { docType = 'LAINNYA' } = req.body ?? {};
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    const cleanupTemp = () => {
      try { fs.rmSync(file.path, { force: true }); } catch { /* best-effort */ }
    };
    const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!r) {
      cleanupTemp();
      return fail(res, 404, 'Tidak ditemukan');
    }
    // Policy: hanya pemilik draft yang boleh mengunggah, berlaku untuk semua role.
    // Cek ownership sebelum status agar non-pemilik selalu mendapat 403.
    if (r.employeeId !== req.user!.employeeId) {
      cleanupTemp();
      return fail(res, 403, 'Hanya pemilik draft yang boleh mengunggah');
    }
    if (!['DRAFT', 'REVISION'].includes(r.status)) {
      cleanupTemp();
      return fail(res, 409, 'Upload hanya saat DRAFT/REVISION');
    }
    let contentHash: string;
    try {
      contentHash = await hashFileAtPath(file.path);
    } catch {
      cleanupTemp();
      return fail(res, 422, 'Gagal membaca file untuk dihitung hash-nya');
    }
    const storedPath = await storeUploadedFile(file, `leave/${r.id}`);
    try {
      const doc = await prisma.leaveDocument.create({
        data: {
          leaveRequestId: r.id,
          docType: String(docType),
          originalName: file.originalname,
          storedPath,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          contentHash,
          uploadedBy: req.user!.id,
        },
      });
      return res.status(201).json({ success: true, message: 'Dokumen diupload', data: doc, meta: null, errors: null });
    } catch (e) {
      await deleteStoredFile(storedPath).catch(() => undefined);
      throw e;
    }
  });
});

// GET download
router.get('/:id/documents/:docId/download', requirePermission('leave.view'), async (req, res) => {
  const doc = await prisma.leaveDocument.findFirst({
    where: { id: req.params.docId, leaveRequestId: req.params.id },
  });
  if (!doc) return fail(res, 404, 'Dokumen tidak ditemukan');
  if (!(await sendStoredFile(res, doc.storedPath, doc.originalName, doc.mimeType))) return fail(res, 404, 'Dokumen tidak ditemukan');
  return;
});

// POST /leave-requests/:id/answer-letter (B1: surat jawaban BKPSDM)
// Multipart file; docType otomatis SURAT_JAWABAN_BKPSDM. Status tetap.
// Hanya saat APPROVED/REGISTERED/SUBMITTED_BKPSDMD, diunggah pelaksana (bukan pemohon).
// (Didefinisikan SEBELUM /:id/:action agar tidak tertangkap action generik.)
router.post('/:id/answer-letter', requirePermission('leave.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const file = (req as any).file;
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    const cleanupTemp = () => {
      try { fs.rmSync(file.path, { force: true }); } catch { /* best-effort */ }
    };
    const r = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!r) {
      cleanupTemp();
      return fail(res, 404, 'Tidak ditemukan');
    }
    if (!['APPROVED', 'REGISTERED', 'SUBMITTED_BKPSDMD'].includes(r.status)) {
      cleanupTemp();
      return fail(res, 409, `Surat jawaban hanya dicatat saat APPROVED/REGISTERED/SUBMITTED_BKPSDMD (saat ini ${r.status})`);
    }
    if (req.user!.employeeId && r.employeeId === req.user!.employeeId && req.user!.role === 'EMPLOYEE') {
      cleanupTemp();
      return fail(res, 403, 'Surat jawaban diunggah pelaksana, bukan pemohon');
    }
    let contentHash: string;
    try {
      contentHash = await hashFileAtPath(file.path);
    } catch {
      cleanupTemp();
      return fail(res, 422, 'Gagal membaca file untuk dihitung hash-nya');
    }
    const storedPath = await storeUploadedFile(file, `leave/${r.id}`);
    try {
      const doc = await prisma.leaveDocument.create({
        data: {
          leaveRequestId: r.id,
          docType: 'SURAT_JAWABAN_BKPSDM',
          originalName: file.originalname,
          storedPath,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          contentHash,
          uploadedBy: req.user!.id,
        },
      });
      return res.status(201).json({ success: true, message: 'Surat jawaban BKPSDM dicatat', data: doc, meta: null, errors: null });
    } catch (e) {
      await deleteStoredFile(storedPath).catch(() => undefined);
      throw e;
    }
  });
});

// POST /leave-requests/:id/:action
// (submit/review/verify/revise/postpone/paraf/approve/register/tobkpsdm/receiveresult/complete/archive/forward/reject)
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
  // Ownership untuk submit (termasuk pengajuan ulang dari POSTPONED), semua role.
  // Jangan hanya bergantung pada permission: SUPER_ADMIN punya bypass '*'.
  // Cek sebelum status agar non-pemilik selalu mendapat 403.
  if (action === 'submit' && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya pemilik pengajuan yang boleh submit');
  }
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
  const applicantPosition = normalizePosition(applicant.position);
  const skipReview = skipsReviewer(applicantPosition, applicant.orgUnit?.type ?? null);
  const has = (p: string) => canAny(req.user!.permissions, [p]);
  const isSuper = req.user!.role === 'SUPER_ADMIN';
  async function holds(position: string): Promise<boolean> {
    return isSuper || userHoldsPosition(req.user!.id, position);
  }

  // Wewenang paraf/persetujuan ditentukan jabatan, bukan hanya permission.
  // Plt tetap dihitung lewat userHoldsPosition.
  if (action === 'paraf' && !(await holds('SEKCAM'))) {
    return fail(res, 403, 'Paraf cuti hanya oleh Sekcam (atau Plt Sekcam yang aktif)');
  }
  if (action === 'approve' && !(await holds('CAMAT'))) {
    return fail(res, 403, 'Persetujuan akhir cuti hanya oleh Camat (atau Plt Camat yang aktif)');
  }

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
    } else if (r.status === 'REVIEWED') {
      if (!has('leave.verify')) return fail(res, 403, 'Forbidden: butuh permission leave.verify');
    } else if (r.status === 'VERIFIED') {
      if (!(await holds('SEKCAM'))) return fail(res, 403, 'Pengembalian saat VERIFIED hanya oleh Sekcam');
    } else if (r.status === 'PARAF') {
      if (!(await holds('CAMAT'))) return fail(res, 403, 'Pengembalian saat PARAF hanya oleh Camat');
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
    } else if (r.status === 'REVIEWED') {
      if (!has('leave.verify')) return fail(res, 403, 'Forbidden: butuh permission leave.verify');
    } else if (r.status === 'VERIFIED') {
      if (!(await holds('SEKCAM'))) return fail(res, 403, 'Penangguhan saat VERIFIED hanya oleh Sekcam');
    } else if (r.status === 'PARAF') {
      if (!(await holds('CAMAT'))) return fail(res, 403, 'Penangguhan saat PARAF hanya oleh Camat');
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
  if (action === 'reject' && r.status === 'VERIFIED' && !(await holds('SEKCAM'))) {
    return fail(res, 403, 'Penolakan saat VERIFIED hanya oleh Sekcam');
  }
  if (action === 'reject' && r.status === 'PARAF' && !(await holds('CAMAT'))) {
    return fail(res, 403, 'Penolakan saat PARAF hanya oleh Camat');
  }
  // Lompat-paraf: approve langsung dari VERIFIED hanya untuk pemohon SEKCAM.
  // Pemohon lain wajib lewat PARAF. Paraf untuk pemohon SEKCAM ditolak.
  if (action === 'approve' && r.status === 'VERIFIED' && applicantPosition !== 'SEKCAM') {
    return fail(res, 422, 'Persetujuan harus dari PARAF (kecuali pemohon Sekcam)');
  }
  if (action === 'paraf' && applicantPosition === 'SEKCAM') {
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
    if (applicantPosition !== 'CAMAT') {
      return fail(res, 422, 'Forward ke Sekda hanya untuk pengajuan Camat');
    }
    if (!note) return fail(res, 422, 'note wajib untuk forward (catat nomor/tanggal penerusan ke Sekda)');
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
  // Hasil BKPSDM diterima + diserahkan ke pegawai hanya bila jawaban sudah dicatat.
  if (action === 'receiveresult') {
    const ans = await prisma.leaveDocument.count({ where: { leaveRequestId: r.id, docType: 'SURAT_JAWABAN_BKPSDM' } });
    if (!ans) {
      return fail(res, 422, 'Belum ada surat jawaban BKPSDM — catat dulu via POST /leave-requests/:id/answer-letter');
    }
  }
  // Snapshot persetujuan digital (B11): nama + NIP + jabatan + waktu.
  const actorFull = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { employee: true } });
  const actorName = actorFull?.employee?.name ?? req.user!.username;
  const actorNip = actorFull?.employee?.nip ?? null;
  const actingAs = action === 'paraf'
    ? 'SEKCAM'
    : action === 'approve'
      ? 'CAMAT'
      : (['revise', 'reject', 'postpone'].includes(action) && r.status === 'VERIFIED')
        ? 'SEKCAM'
        : (['revise', 'reject', 'postpone'].includes(action) && r.status === 'PARAF')
          ? 'CAMAT'
          : null;
  const actorPosition = await effectivePosition(req.user!.id, req.user!.position, actingAs);
  const currentVersion = r.version ?? 1;
  // Versi baru terbentuk saat dokumen revisi diajukan ulang. Paraf pada versi
  // lama tetap tersimpan di riwayat dan tidak boleh diubah.
  const nextVersion = action === 'submit' && r.status === 'REVISION'
    ? currentVersion + 1
    : currentVersion;
  const returnFrom = action === 'revise' && ['VERIFIED', 'PARAF'].includes(r.status);
  const shouldRecordParaf = ['paraf', 'approve', 'reject'].includes(action) || returnFrom;
  const parafAction = returnFrom ? 'RETURN' : action.toUpperCase();

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.leaveRequest.update({
      where: { id: r.id },
      data: {
        status: t.to,
        version: nextVersion,
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
        actorPosition,
        actorName,
        actorNip,
        fromStatus: r.status,
        toStatus: t.to,
        action: action.toUpperCase(),
        note: note ?? null,
      },
    });
    if (shouldRecordParaf) {
      const docs = await tx.leaveDocument.findMany({
        where: { leaveRequestId: r.id },
        select: { id: true, docType: true, originalName: true, sizeBytes: true, contentHash: true },
      });
      const payload = leaveDocumentPayload({ ...r, version: nextVersion }, docs);
      await recordParaf(tx, {
        documentType: 'LEAVE',
        documentId: r.id,
        documentNumber: r.requestNumber,
        documentVersion: nextVersion,
        documentHash: hashDocument(payload),
        actor: {
          userId: req.user!.id,
          name: actorName,
          nip: actorNip,
          position: actorPosition,
        },
        action: parafAction as 'PARAF' | 'APPROVE' | 'RETURN' | 'REJECT',
        note: note ?? null,
      });
    }
    return u;
  });

  await notifyLeaveTransition({
    requestId: r.id, requestNumber: r.requestNumber, employeeId: r.employeeId,
    action, fromStatus: r.status, toStatus: t.to,
    actorId: req.user!.id, actorName,
    actorPosition, note, skipReview, applicantPosition,
  });

  const full = await prisma.leaveRequest.findUnique({ where: { id: updated.id }, include: includeDetail });
  return ok(res, await toDetail(full, req.user!), `${action} berhasil`);
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
    await deleteStoredFile(d.storedPath).catch(() => undefined);
  }
  return ok(res, null, 'Draf dihapus');
});

export default router;
