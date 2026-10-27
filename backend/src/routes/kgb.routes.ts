import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { availableActions, computeKgbSchedule, KGB_OVERDUE_MONTHS, KGB_REMINDER_MONTHS, KGB_REQUIRED_DOCS, TRANSITIONS } from '../services/kgb.service';
import { ok, fail } from '../utils/response';
import { can, usersForPermission } from '../lib/permissions';
import { parseYMD } from '../services/attendance.service';

const router = Router();
router.use(authRequired);

const ACTION_LABEL_ID: Record<string, string> = {
  submit: 'diajukan', verify: 'diverifikasi', revise: 'diminta revisi',
  paraf: 'diparaf', approve: 'disetujui', register: 'diregistrasi',
  tobkpsdm: 'diteruskan ke BKPSDM', complete: 'diselesaikan',
  archive: 'diarsipkan', reject: 'ditolak',
};

// Pemegang tahap berikutnya yang perlu diberi notifikasi.
const NEXT_PERMISSION: Record<string, string | null> = {
  submit: 'kgb.verify', verify: 'kgb.paraf', revise: 'kgb.submit',
  paraf: 'kgb.approve', approve: 'kgb.register', register: 'kgb.register',
  tobkpsdm: 'kgb.register', complete: 'kgb.register',
  archive: null, reject: null,
};

// Notifikasi tiap transisi KGB: pemegang tahap berikut + pemohon.
// Best-effort: kegagalan notifikasi tidak menggagalkan aksi.
async function notifyKgbTransition(opts: {
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
    if (applicantUser) ids.add(applicantUser.id);
    ids.delete(opts.actorId);
    if (!ids.size) return;
    const label = ACTION_LABEL_ID[opts.action] ?? opts.action;
    await prisma.notification.createMany({
      data: [...ids].map((userId) => ({
        userId,
        type: 'KGB',
        title: `KGB ${opts.requestNumber} ${label}`,
        body: `${opts.actorName}${opts.actorPosition ? ` (${opts.actorPosition})` : ''}: ${opts.fromStatus} -> ${opts.toStatus}${opts.note ? ` - ${opts.note}` : ''}`,
        referenceType: 'kgb_request',
        referenceId: opts.requestId,
      })),
    });
  } catch (e) {
    console.error('notify KGB gagal:', (e as Error).message);
  }
}

const PANGKAT_BY_GOL: Record<string, string> = {
  'i/a': 'Juru Muda', 'i/b': 'Juru Muda Tingkat I',
  'i/c': 'Juru', 'i/d': 'Juru Tingkat I',
  'ii/a': 'Pengatur Muda', 'ii/b': 'Pengatur Muda Tingkat I',
  'ii/c': 'Pengatur', 'ii/d': 'Pengatur Tingkat I',
  'iii/a': 'Penata Muda', 'iii/b': 'Penata Muda Tingkat I',
  'iii/c': 'Penata', 'iii/d': 'Penata Tingkat I',
  'iv/a': 'Pembina', 'iv/b': 'Pembina Tingkat I',
  'iv/c': 'Pembina Utama Muda', 'iv/d': 'Pembina Utama Madya',
  'iv/e': 'Pembina Utama',
};

function pangkatForGol(gol: string): string {
  return PANGKAT_BY_GOL[gol.trim().toLowerCase()] ?? '-';
}

// note register berisi nomor surat keluar; ambil nomornya saja untuk buku register.
function registerNumberFromNote(note: string | null | undefined, fallback: string): string {
  if (!note) return fallback;
  const cleaned = note
    .replace(/^(nomor\s+surat(\s+keluar)?|no\.?)\s*[:=]?\s*/i, '')
    .replace(/\s*\|\s*tanggal.*$/i, '')
    .trim();
  return cleaned || fallback;
}

// GET /kgb-requests/register-book — buku register KGB (step 7 SOP)
// Kolom: tglSk, nama, nip, gol, pangkat, jabatan, unitKerja,
//   lama: {nomorSk, tanggalSk, tglMulai, masaKerja, tahun, golMasaKerja, gajiPokok},
//   baru: {tglMulai, kgbYad, masaKerja, tahun, golMasaKerja, gajiPokok}
router.get('/register-book', requirePermission('kgb.view'), async (req, res) => {
  const { year } = req.query as any;
  const y = year ? Number(year) : null;
  if (y !== null && (!Number.isInteger(y) || y < 1900 || y > 2200)) {
    return fail(res, 422, 'year tidak valid');
  }

  // Ambil semua KGB final (bukan hanya tahun berjalan) agar kolom "KGB Lama"
  // memakai KGB sebelumnya yang sebenarnya, walau berada di tahun berbeda.
  const allItems = await prisma.kgbRequest.findMany({
    where: {
      status: { in: ['APPROVED', 'REGISTERED', 'SUBMITTED_BKPSDMD', 'COMPLETED', 'ARCHIVED'] },
    },
    include: {
      employee: { include: { orgUnit: true } },
      approvals: {
        where: { action: 'REGISTER' },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { note: true, createdAt: true },
      },
    },
    orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
  });

  function masaKerja(joinDate: Date | null, refDate: Date): string {
    if (!joinDate) return '-';
    const months = (refDate.getFullYear() - joinDate.getFullYear()) * 12 + (refDate.getMonth() - joinDate.getMonth());
    if (months < 0) return '-';
    const yy = Math.floor(months / 12);
    const m = months % 12;
    return m > 0 ? `${yy} Tahun ${m} Bulan` : `${yy} Tahun`;
  }

  const previousByEmp = new Map<string, any>();
  const rows: any[] = [];
  for (const k of allItems) {
    const previous = previousByEmp.get(k.employeeId) ?? null;
    previousByEmp.set(k.employeeId, k);

    const emp = k.employee;
    const effDate = new Date(k.effectiveDate);
    if (y !== null && effDate.getFullYear() !== y) continue;

    const joinDate = emp.joinDate ? new Date(emp.joinDate) : null;
    const register = k.approvals?.[0] ?? null;
    const registerDate = register?.createdAt ? new Date(register.createdAt) : null;
    const previousRegister = previous?.approvals?.[0] ?? null;
    const previousDate = previous ? new Date(previous.effectiveDate) : null;
    const previousRegisterDate = previousRegister?.createdAt ? new Date(previousRegister.createdAt) : null;
    const nextKgb = new Date(effDate);
    nextKgb.setFullYear(nextKgb.getFullYear() + 2);

    // Masa kerja dicatat pada TMT KGB, bukan pada TMT berikutnya.
    const masaLama = previousDate ? masaKerja(joinDate, previousDate) : masaKerja(joinDate, effDate);
    const masaBaru = masaKerja(joinDate, effDate);
    const lamaRank = previous?.newRank ?? k.oldRank;
    const lamaSalary = previous?.newSalary ?? k.oldSalary;

    rows.push({
      tglSk: (registerDate ?? effDate).toISOString().slice(0, 10),
      nama: emp.name,
      nip: emp.nip,
      // Golongan/pangkat pada baris register adalah hasil KGB (golongan baru),
      // bukan campuran golongan lama dan baru.
      gol: k.newRank,
      pangkat: pangkatForGol(k.newRank),
      jabatan: emp.position,
      unitKerja: emp.orgUnit?.name ?? '-',
      lama: {
        nomorSk: previousRegister
          ? registerNumberFromNote(previousRegister.note, previous.requestNumber)
          : '-',
        tanggalSk: previousRegisterDate ? previousRegisterDate.toISOString().slice(0, 10) : '-',
        tglMulai: previousDate ? previousDate.toISOString().slice(0, 10) : '-',
        masaKerja: masaLama,
        tahun: previousDate ? previousDate.getFullYear() : effDate.getFullYear(),
        golMasaKerja: `${lamaRank} & ${masaLama}`,
        gajiPokok: lamaSalary,
      },
      baru: {
        tglMulai: effDate.toISOString().slice(0, 10),
        kgbYad: nextKgb.toISOString().slice(0, 10),
        masaKerja: masaBaru,
        tahun: effDate.getFullYear(),
        golMasaKerja: `${k.newRank} & ${masaBaru}`,
        gajiPokok: k.newSalary,
      },
    });
  }
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

  // Basis jatuh tempo harus KGB final terakhir (COMPLETED/ARCHIVED), bukan
  // record terbaru berdasarkan createdAt: draf/revisi yang belum selesai tidak
  // boleh menggeser tanggal KGB berikutnya.
  const finalKgb = await prisma.kgbRequest.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      status: { in: ['COMPLETED', 'ARCHIVED'] },
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });
  const finalByEmp = new Map<string, any>();
  for (const k of finalKgb) {
    if (!finalByEmp.has(k.employeeId)) finalByEmp.set(k.employeeId, k);
  }

  const now = new Date();
  const items = employees.map((e) => {
    const last = finalByEmp.get(e.id) ?? null;
    const baseDate = last
      ? new Date(last.effectiveDate)
      : e.joinDate
        ? new Date(e.joinDate)
        : null;
    const schedule = baseDate ? computeKgbSchedule(baseDate, now) : null;
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
      nextKgbDate: schedule?.nextKgbDate ?? null,
      monthsUntil: schedule?.monthsUntil ?? null,
      dueSoon: schedule?.dueSoon ?? false,
      isOverdue: schedule?.isOverdue ?? false,
      requiredDocs: schedule && (schedule.dueSoon || schedule.isOverdue) ? KGB_REQUIRED_DOCS : [],
    };
  });
  return ok(res, items, 'ok', {
    total: items.length,
    dueSoon: items.filter((i) => i.dueSoon).length,
    overdue: items.filter((i) => i.isOverdue).length,
  });
});

// POST /kgb-requests/reminders/generate — buat notifikasi pengingat KGB
// untuk pegawai yang jatuh tempo ≤3 bulan (ke pegawai + staf kepegawaian + kasubag).
router.post('/reminders/generate', requirePermission('kgb.remind'), async (req, res) => {
  const employees = await prisma.employee.findMany({ where: { isActive: true }, include: { orgUnit: true } });
  const finalKgb = await prisma.kgbRequest.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      status: { in: ['COMPLETED', 'ARCHIVED'] },
    },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });
  const finalByEmp = new Map<string, any>();
  for (const k of finalKgb) {
    if (!finalByEmp.has(k.employeeId)) finalByEmp.set(k.employeeId, k);
  }

  const now = new Date();
  const due: Array<{
    employee: any;
    nextKgbDate: string;
    monthsUntil: number;
    isOverdue: boolean;
  }> = [];
  for (const e of employees) {
    const last = finalByEmp.get(e.id) ?? null;
    const baseDate = last
      ? new Date(last.effectiveDate)
      : e.joinDate
        ? new Date(e.joinDate)
        : null;
    if (!baseDate) continue;
    const schedule = computeKgbSchedule(baseDate, now);
    // Kirim untuk yang akan jatuh tempo (<= 3 bulan) dan yang terlambat
    // maksimal 12 bulan; lebih dari itu biasanya sudah tidak relevan.
    if (schedule.monthsUntil < -KGB_OVERDUE_MONTHS) continue;
    if (schedule.monthsUntil > KGB_REMINDER_MONTHS) continue;
    due.push({ employee: e, ...schedule });
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
    if (!recipients.size) continue;

    const docList = KGB_REQUIRED_DOCS.join(', ');
    const statusText = d.isOverdue
      ? `TERLAMBAT ${Math.abs(d.monthsUntil)} bulan`
      : `${d.monthsUntil} bulan lagi`;
    await prisma.notification.createMany({
      data: [...recipients].map((userId) => ({
        userId,
        type: 'KGB_REMINDER',
        title: `Pengingat KGB: ${d.employee.name}`,
        body: `KGB pegawai ${d.employee.name} (NIP ${d.employee.nip ?? '-'}) jatuh tempo ${d.nextKgbDate} (${statusText}). ` +
          `Berkas yang perlu disiapkan: ${docList}. Harap segera melengkapi berkas.`,
        referenceType: 'kgb_reminder',
        referenceId: null,
      })),
    });
    result.push({
      employee: d.employee.name,
      nextKgbDate: d.nextKgbDate,
      monthsUntil: d.monthsUntil,
      isOverdue: d.isOverdue,
      notified: recipients.size,
    });
  }
  const overdueCount = result.filter((r) => r.isOverdue).length;
  return ok(res, result, `${result.length} pengingat dibuat${overdueCount ? ` (${overdueCount} terlambat)` : ''}`);
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

  // Snapshot aktor untuk notifikasi (nama pegawai + jabatan).
  const actorFull = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { employee: true } });

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

  await notifyKgbTransition({
    requestId: r.id, requestNumber: r.requestNumber, employeeId: r.employeeId,
    action, fromStatus: r.status, toStatus: t.to,
    actorId: req.user!.id, actorName: actorFull?.employee?.name ?? req.user!.username,
    actorPosition: req.user!.position, note,
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
