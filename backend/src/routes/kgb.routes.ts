import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { availableActions, KGB_REQUIRED_DOCS, TRANSITIONS } from '../services/kgb.service';
import { ok, fail } from '../utils/response';
import { can } from '../lib/permissions';
import { parseYMD } from '../services/attendance.service';

const router = Router();
router.use(authRequired);

// GET /kgb-requests/register-book — buku register KGB (step 7 SOP)
// Kolom: tglSk, nama, nip, gol, pangkat, jabatan, unitKerja,
//   lama: {nomorSk, tanggalSk, tglMulai, masaKerja, tahun, golMasaKerja, gajiPokok},
//   baru: {tglMulai, kgbYad, masaKerja, tahun, golMasaKerja, gajiPokok}
router.get('/register-book', requirePermission('kgb.view'), async (req, res) => {
  const { year } = req.query as any;
  const where: any = {
    status: { in: ['APPROVED', 'REGISTERED', 'SUBMITTED_BKPSDMD', 'COMPLETED', 'ARCHIVED'] },
  };
  if (year) {
    const y = Number(year);
    where.effectiveDate = { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31`) };
  }
  const items = await prisma.kgbRequest.findMany({
    where,
    include: { employee: { include: { orgUnit: true } } },
    orderBy: { effectiveDate: 'asc' },
  });

  function masaKerja(joinDate: Date | null, refDate: Date): string {
    if (!joinDate) return '-';
    const months = (refDate.getFullYear() - joinDate.getFullYear()) * 12 + (refDate.getMonth() - joinDate.getMonth());
    if (months < 0) return '-';
    const y = Math.floor(months / 12);
    const m = months % 12;
    return m > 0 ? `${y} Tahun ${m} Bulan` : `${y} Tahun`;
  }

  const rows = items.map((k) => {
    const emp = k.employee;
    const joinDate = emp.joinDate ? new Date(emp.joinDate) : null;
    const effDate = new Date(k.effectiveDate);
    const nextKgb = new Date(effDate);
    nextKgb.setFullYear(nextKgb.getFullYear() + 2);
    const masaLama = masaKerja(joinDate, effDate);
    const masaBaru = masaKerja(joinDate, nextKgb);
    return {
      tglSk: effDate.toISOString().slice(0, 10),
      nama: emp.name,
      nip: emp.nip,
      gol: k.oldRank,
      pangkat: k.oldRank,
      jabatan: emp.position,
      unitKerja: emp.orgUnit?.name ?? '-',
      lama: {
        nomorSk: k.note ?? k.requestNumber,
        tanggalSk: effDate.toISOString().slice(0, 10),
        tglMulai: effDate.toISOString().slice(0, 10),
        masaKerja: masaLama,
        tahun: effDate.getFullYear(),
        golMasaKerja: `${k.oldRank} & ${masaLama}`,
        gajiPokok: k.oldSalary,
      },
      baru: {
        tglMulai: effDate.toISOString().slice(0, 10),
        kgbYad: nextKgb.toISOString().slice(0, 10),
        masaKerja: masaBaru,
        tahun: effDate.getFullYear(),
        golMasaKerja: `${k.newRank} & ${masaBaru}`,
        gajiPokok: k.newSalary,
      },
    };
  });
  return ok(res, rows, 'ok', { total: rows.length });
});

// GET /kgb-requests/monitoring — daftar pegawai + KGB terakhir (step 1 SOP)
// + perhitungan jatuh tempo KGB berikutnya (2 tahun dari KGB terakhir / tanggal masuk)
// + flag dueSoon (≤3 bulan) untuk pemicu pengingat.
router.get('/monitoring', requirePermission('kgb.view'), async (req, res) => {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    include: { orgUnit: true },
    orderBy: { name: 'asc' },
  });
  const lastKgb = await prisma.kgbRequest.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) } },
    orderBy: { createdAt: 'desc' },
    include: { employee: true },
  });
  const byEmp: Record<string, any> = {};
  for (const k of lastKgb) {
    if (!byEmp[k.employeeId]) byEmp[k.employeeId] = k;
  }
  const now = new Date();
  const items = employees.map((e) => {
    const last = byEmp[e.id];
    let baseDate: Date | null = null;
    if (last && last.status === 'COMPLETED') {
      baseDate = new Date(last.effectiveDate);
    } else if (e.joinDate) {
      baseDate = new Date(e.joinDate);
    }
    let nextKgbDate: string | null = null;
    let monthsUntil: number | null = null;
    if (baseDate) {
      const next = new Date(baseDate);
      next.setFullYear(next.getFullYear() + 2);
      nextKgbDate = next.toISOString().slice(0, 10);
      monthsUntil = (next.getFullYear() - now.getFullYear()) * 12 + (next.getMonth() - now.getMonth());
    }
    const dueSoon = monthsUntil !== null && monthsUntil >= 0 && monthsUntil <= 3;
    return {
      employee: { id: e.id, nip: e.nip, name: e.name, position: e.position, rank: e.rank, orgUnit: e.orgUnit.code },
      lastKgb: last
        ? {
            id: last.id,
            requestNumber: last.requestNumber,
            oldRank: last.oldRank,
            newRank: last.newRank,
            effectiveDate: last.effectiveDate.toISOString().slice(0, 10),
            status: last.status,
          }
        : null,
      nextKgbDate,
      monthsUntil,
      dueSoon,
      requiredDocs: dueSoon ? KGB_REQUIRED_DOCS : [],
    };
  });
  return ok(res, items, 'ok', { total: items.length, dueSoon: items.filter((i) => i.dueSoon).length });
});

// POST /kgb-requests/reminders/generate — buat notifikasi pengingat KGB
// untuk pegawai yang jatuh tempo ≤3 bulan (ke pegawai + staf kepegawaian + kasubag).
router.post('/reminders/generate', requirePermission('kgb.remind'), async (req, res) => {
  const employees = await prisma.employee.findMany({ where: { isActive: true }, include: { orgUnit: true } });
  const lastKgb = await prisma.kgbRequest.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) } },
    orderBy: { createdAt: 'desc' },
  });
  const byEmp: Record<string, any> = {};
  for (const k of lastKgb) {
    if (!byEmp[k.employeeId]) byEmp[k.employeeId] = k;
  }
  const now = new Date();
  const due: Array<{ employee: any; nextKgbDate: string; monthsUntil: number }> = [];
  for (const e of employees) {
    const last = byEmp[e.id];
    let baseDate: Date | null = null;
    if (last && last.status === 'COMPLETED') baseDate = new Date(last.effectiveDate);
    else if (e.joinDate) baseDate = new Date(e.joinDate);
    if (!baseDate) continue;
    const next = new Date(baseDate);
    next.setFullYear(next.getFullYear() + 2);
    const monthsUntil = (next.getFullYear() - now.getFullYear()) * 12 + (next.getMonth() - now.getMonth());
    if (monthsUntil >= 0 && monthsUntil <= 3) {
      due.push({ employee: e, nextKgbDate: next.toISOString().slice(0, 10), monthsUntil });
    }
  }

  const result = [];
  for (const d of due) {
    const empUser = await prisma.user.findFirst({ where: { employeeId: d.employee.id, isActive: true }, select: { id: true } });
    const recipients = new Set<string>();
    if (empUser) recipients.add(empUser.id);
    // staf kepegawaian (operator)
    const staf = await prisma.user.findMany({ where: { position: 'STAF_KEPEGAWAIAN', isActive: true }, select: { id: true } });
    for (const s of staf) recipients.add(s.id);
    // kasubag
    const kasubag = await prisma.user.findMany({ where: { position: 'KASUBAG', isActive: true }, select: { id: true } });
    for (const k of kasubag) recipients.add(k.id);

    const docList = KGB_REQUIRED_DOCS.join(', ');
    await prisma.notification.createMany({
      data: [...recipients].map((userId) => ({
        userId,
        type: 'KGB_REMINDER',
        title: `Pengingat KGB: ${d.employee.name}`,
        body: `KGB pegawai ${d.employee.name} (NIP ${d.employee.nip ?? '-'}) jatuh tempo ${d.nextKgbDate} (${d.monthsUntil} bulan lagi). ` +
          `Berkas yang perlu disiapkan: ${docList}. Harap segera melengkapi berkas.`,
        referenceType: 'kgb_reminder',
        referenceId: null,
      })),
    });
    result.push({ employee: d.employee.name, nextKgbDate: d.nextKgbDate, monthsUntil: d.monthsUntil, notified: recipients.size });
  }
  return ok(res, result, `${result.length} pengingat dibuat`);
});

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: env.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const userMini = { select: { id: true, username: true, employee: { select: { name: true, nip: true } } } };

async function toDetail(r: any, perms: string[]) {
  const camat = await prisma.user.findFirst({
    where: { position: 'CAMAT', isActive: true },
    include: { employee: { select: { name: true, nip: true } } },
  });
  return {
    ...r,
    availableActions: availableActions(r.status, perms),
    camat: camat ? { name: camat.employee?.name ?? camat.username, nip: camat.employee?.nip ?? null, position: 'CAMAT' } : null,
    documents: (r.documents ?? []).map((d: any) => ({
      id: d.id,
      docType: d.docType,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      downloadUrl: `/api/v1/kgb-requests/${r.id}/documents/${d.id}/download`,
    })),
    timeline: (r.approvals ?? []).map((a: any) => ({
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      actor: `${a.actor?.username ?? '?'} (${a.actorRole}${a.actorPosition ? '/' + a.actorPosition : ''})`,
      actorName: a.actor?.employee?.name ?? a.actor?.username ?? null,
      actorNip: a.actor?.employee?.nip ?? null,
      actorRole: a.actorRole,
      actorPosition: a.actorPosition,
      note: a.note,
      createdAt: a.createdAt,
    })),
  };
}

const includeDetail = {
  employee: { include: { orgUnit: true } },
  documents: true,
  approvals: { include: { actor: { omit: { passwordHash: true }, include: { employee: { select: { name: true, nip: true } } } } }, orderBy: { createdAt: 'asc' as const } },
};

// GET /kgb-requests
router.get('/', requirePermission('kgb.view'), async (req, res) => {
  const { status, page = '1', limit = '10', q } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (q) where.employee = { name: { contains: String(q), mode: 'insensitive' } };
  if (req.user!.role === 'EMPLOYEE' && req.user!.employeeId) {
    where.employeeId = req.user!.employeeId;
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.kgbRequest.count({ where }),
    prisma.kgbRequest.findMany({
      where,
      include: { employee: { include: { orgUnit: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// GET /kgb-requests/:id
router.get('/:id', requirePermission('kgb.view'), async (req, res) => {
  const r = await prisma.kgbRequest.findUnique({ where: { id: req.params.id }, include: includeDetail });
  if (!r) return fail(res, 404, 'Pengajuan KGB tidak ditemukan');
  if (req.user!.role === 'EMPLOYEE' && req.user!.employeeId && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya boleh melihat pengajuan sendiri');
  }
  return ok(res, await toDetail(r, req.user!.permissions));
});

// POST /kgb-requests (DRAFT)
router.post('/', requirePermission('kgb.create'), async (req, res) => {
  const schema = z.object({
    oldRank: z.string().min(1, 'Golongan lama wajib'),
    newRank: z.string().min(1, 'Golongan baru wajib'),
    oldSalary: z.number().int().positive('Gaji lama harus > 0'),
    newSalary: z.number().int().positive('Gaji baru harus > 0'),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(1000).optional(),
    employeeId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  if (b.newSalary <= b.oldSalary) return fail(res, 422, 'Gaji baru harus lebih besar dari gaji lama');
  if (!parseYMD(b.effectiveDate)) return fail(res, 422, 'effectiveDate tidak valid');

  let employeeId = req.user!.employeeId;
  if (b.employeeId) {
    if (req.user!.role === 'EMPLOYEE') return fail(res, 403, 'Tidak boleh membuat untuk orang lain');
    employeeId = b.employeeId;
  }
  if (!employeeId) return fail(res, 422, 'User ini tidak terhubung ke data employee');

  const count = await prisma.kgbRequest.count();
  const requestNumber = `KGB-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  const r = await prisma.$transaction(async (tx) => {
    const created = await tx.kgbRequest.create({
      data: {
        requestNumber,
        employeeId: employeeId!,
        oldRank: b.oldRank,
        newRank: b.newRank,
        oldSalary: b.oldSalary,
        newSalary: b.newSalary,
        effectiveDate: parseYMD(b.effectiveDate)!,
        note: b.note,
        status: 'DRAFT',
        currentHolderRole: 'EMPLOYEE',
        createdBy: req.user!.id,
      },
      include: includeDetail,
    });
    await tx.kgbApproval.create({
      data: {
        kgbRequestId: created.id,
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
  const full = await prisma.kgbRequest.findUnique({ where: { id: r.id }, include: includeDetail });
  return res.status(201).json({ success: true, message: 'Draf KGB dibuat', data: await toDetail(full, req.user!.permissions), meta: null, errors: null });
});

// PATCH /kgb-requests/:id (DRAFT/REVISION, pemilik)
router.patch('/:id', requirePermission('kgb.create'), async (req, res) => {
  const r = await prisma.kgbRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(r.status)) return fail(res, 409, `Hanya DRAFT/REVISION yang bisa diubah (saat ini ${r.status})`);
  if (req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) return fail(res, 403, 'Bukan milikmu');
  const schema = z.object({
    oldRank: z.string().min(1).optional(),
    newRank: z.string().min(1).optional(),
    oldSalary: z.number().int().positive().optional(),
    newSalary: z.number().int().positive().optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const finalOld = b.oldSalary ?? r.oldSalary;
  const finalNew = b.newSalary ?? r.newSalary;
  if (finalNew <= finalOld) return fail(res, 422, 'Gaji baru harus lebih besar dari gaji lama');
  const updated = await prisma.kgbRequest.update({
    where: { id: r.id },
    data: {
      ...b,
      ...(b.effectiveDate ? { effectiveDate: parseYMD(b.effectiveDate)! } : {}),
    },
    include: includeDetail,
  });
  return ok(res, await toDetail(updated, req.user!.permissions));
});

// POST /kgb-requests/:id/documents
router.post('/:id/documents', requirePermission('kgb.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const file = (req as any).file;
    const { docType = 'LAINNYA' } = req.body ?? {};
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    const r = await prisma.kgbRequest.findUnique({ where: { id: req.params.id } });
    if (!r) return fail(res, 404, 'Tidak ditemukan');
    if (!['DRAFT', 'REVISION'].includes(r.status)) return fail(res, 409, 'Upload hanya saat DRAFT/REVISION');
    if (req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) return fail(res, 403, 'Bukan milikmu');
    const ext = path.extname(file.originalname);
    const storedPath = file.path + ext;
    fs.renameSync(file.path, storedPath);
    const doc = await prisma.kgbDocument.create({
      data: {
        kgbRequestId: r.id,
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
router.get('/:id/documents/:docId/download', requirePermission('kgb.view'), async (req, res) => {
  const doc = await prisma.kgbDocument.findFirst({
    where: { id: req.params.docId, kgbRequestId: req.params.id },
  });
  if (!doc || !fs.existsSync(doc.storedPath)) return fail(res, 404, 'Dokumen tidak ditemukan');
  return res.download(doc.storedPath, doc.originalName);
});

// POST /kgb-requests/:id/:action
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
  if (action === 'register' && !note) {
    return fail(res, 422, 'note wajib untuk register (catat nomor surat keluar)');
  }

  const r = await prisma.kgbRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  if (!t.from.includes(r.status)) {
    return fail(res, 409, `Status harus ${t.from.join('/')} , saat ini ${r.status}`);
  }
  if (action === 'submit' && req.user!.role === 'EMPLOYEE' && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Bukan milikmu');
  }

  // Guard: register (step 7) hanya staf kecamatan (catat di buku agenda surat keluar + nomor + stempel)
  if (['register', 'tobkpsdm', 'complete', 'archive'].includes(action) && req.user!.role !== 'SUPER_ADMIN') {
    const operatorOrg = req.user!.orgUnitId
      ? await prisma.organizationalUnit.findUnique({ where: { id: req.user!.orgUnitId } })
      : null;
    if (!operatorOrg || operatorOrg.code !== 'KEC-TAMALATE') {
      return fail(res, 403, 'Registrasi/ekspedisi KGB hanya oleh staf kecamatan');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.kgbRequest.update({
      where: { id: r.id },
      data: {
        status: t.to,
        submittedAt: action === 'submit' ? new Date() : r.submittedAt,
        revisionNote: action === 'revise' ? note : null,
        rejectionReason: action === 'reject' ? note : null,
        currentHolderRole: t.holderAfter,
      },
    });
    await tx.kgbApproval.create({
      data: {
        kgbRequestId: r.id,
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

  const full = await prisma.kgbRequest.findUnique({ where: { id: updated.id }, include: includeDetail });
  return ok(res, await toDetail(full, req.user!.permissions), `${action} berhasil`);
});

// DELETE /kgb-requests/:id — hapus DRAFT milik sendiri
router.delete('/:id', requirePermission('kgb.view'), async (req, res) => {
  const r = await prisma.kgbRequest.findUnique({ where: { id: req.params.id }, include: { documents: true } });
  if (!r) return fail(res, 404, 'Tidak ditemukan');
  if (r.status !== 'DRAFT') return fail(res, 409, `Hanya DRAFT yang bisa dihapus (saat ini ${r.status})`);
  if (req.user!.role !== 'SUPER_ADMIN' && r.employeeId !== req.user!.employeeId) {
    return fail(res, 403, 'Hanya pemilik draf (atau superadmin) yang boleh menghapus');
  }
  await prisma.$transaction(async (tx) => {
    await tx.kgbApproval.deleteMany({ where: { kgbRequestId: r.id } });
    await tx.kgbDocument.deleteMany({ where: { kgbRequestId: r.id } });
    await tx.kgbRequest.delete({ where: { id: r.id } });
  });
  for (const d of r.documents) {
    try { fs.rmSync(d.storedPath, { force: true }); } catch { /* best-effort */ }
  }
  return ok(res, null, 'Draf dihapus');
});


export default router;
