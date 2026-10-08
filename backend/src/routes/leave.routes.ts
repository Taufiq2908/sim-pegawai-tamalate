import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { availableActions, calcDays, TRANSITIONS } from '../services/leave.service';
import { ok, fail } from '../utils/response';
import { can } from '../lib/permissions';

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

function toDetail(r: any, perms: string[]) {
  return {
    ...r,
    availableActions: availableActions(r.status, perms),
    documents: (r.documents ?? []).map((d: any) => ({
      id: d.id,
      docType: d.docType,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      downloadUrl: `/api/v1/leave-requests/${r.id}/documents/${d.id}/download`,
    })),
    timeline: (r.approvals ?? []).map((a: any) => ({
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      actor: `${a.actor?.username ?? '?'} (${a.actorRole}${a.actorPosition ? '/' + a.actorPosition : ''})`,
      note: a.note,
      createdAt: a.createdAt,
    })),
  };
}

const includeDetail = {
  employee: { include: { orgUnit: true } },
  leaveType: true,
  documents: true,
  approvals: { include: { actor: { omit: { passwordHash: true } } }, orderBy: { createdAt: 'asc' as const } },
};

// GET /leave-requests
router.get('/', requirePermission('leave.view'), async (req, res) => {
  const { status, page = '1', limit = '10', q } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (q) where.employee = { name: { contains: String(q), mode: 'insensitive' } };
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
  return ok(res, toDetail(r, req.user!.permissions));
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
  return res.status(201).json({ success: true, message: 'Draf cuti dibuat', data: toDetail(full, req.user!.permissions), meta: null, errors: null });
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
  return ok(res, toDetail(updated, req.user!.permissions));
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

// POST /leave-requests/:id/:action (submit/verify/revise/paraf/approve/sign/register/tobkpsdm/receiveresult/complete/archive/forward/reject)
router.post('/:id/:action', async (req, res) => {
  const { action } = req.params;
  const t = TRANSITIONS[action];
  if (!t) return fail(res, 404, `Action tidak dikenal: ${action}`);
  if (!can(req.user!.permissions, t.permission)) return fail(res, 403, `Forbidden: butuh permission ${t.permission}`);

  const schema = z.object({ note: z.string().optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const note = parsed.data.note;
  if ((action === 'revise' || action === 'reject') && !note) {
    return fail(res, 422, 'note wajib untuk revise/reject');
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
    const emp = await prisma.employee.findUnique({ where: { id: r.employeeId } });
    if (emp?.position !== 'CAMAT') {
      return fail(res, 422, 'Forward ke Sekda hanya untuk pengajuan Camat');
    }
    if (!note) return fail(res, 422, 'note wajib untuk forward (catat nomor/tanggal penerusan ke Sekda)');
  }
  // ownership untuk submit
  if (action === 'submit' && req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Bukan milikmu');
  }
  // Submit wajib melampirkan minimal 2 berkas, salah satunya SK terakhir.
  if (action === 'submit') {
    const docs = await prisma.leaveDocument.findMany({ where: { leaveRequestId: r.id }, select: { docType: true } });
    if (docs.length < 2 || !docs.some((d) => d.docType === 'SK_TERAKHIR')) {
      return fail(res, 422, 'Berkas belum lengkap: wajib ≥2 dokumen termasuk SK_TERAKHIR (mis. + SURAT_CUTI_SEBELUMNYA/FORM_CUTI)');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.leaveRequest.update({
      where: { id: r.id },
      data: {
        status: t.to,
        submittedAt: action === 'submit' ? new Date() : r.submittedAt,
        revisionNote: action === 'revise' ? note : null,
        rejectionReason: action === 'reject' ? note : null,
        currentHolderRole: t.holderAfter,
      },
    });
    await tx.leaveApproval.create({
      data: {
        leaveRequestId: r.id,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        actorPosition: req.user!.position,
        fromStatus: r.status,
        toStatus: t.to,
        action: action.toUpperCase(),
        note: note ?? null,
      },
    });
    return u;
  });

  const full = await prisma.leaveRequest.findUnique({ where: { id: updated.id }, include: includeDetail });
  return ok(res, toDetail(full, req.user!.permissions), `${action} berhasil`);
});

export default router;
