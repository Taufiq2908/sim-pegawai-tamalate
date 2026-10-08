import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { ok, fail } from '../utils/response';
import { todayYMD, parseYMD } from '../services/attendance.service';
import { can } from '../lib/permissions';

const router = Router();
router.use(authRequired);

const LETTER_STATUS = ['RECEIVED', 'DISPOSED', 'COMPLETED', 'ARCHIVED'] as const;
const PRIORITY = ['BIASA', 'SEGERA', 'SANGAT_SEGERA'] as const;
const MAX_LETTER_BYTES = 10_000_000;

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: MAX_LETTER_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const includeDetail = {
  creator: { omit: { passwordHash: true } },
  classification: true,
  documents: { orderBy: { createdAt: 'asc' as const } },
  dispositions: {
    include: { fromUser: { omit: { passwordHash: true } }, toUser: { omit: { passwordHash: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

function availableActions(status: string, perms: string[]): string[] {
  const rules: Record<string, { on: string[]; perm: string }> = {
    paraf: { on: ['RECEIVED'], perm: 'letter.paraf' },
    dispose: { on: ['RECEIVED', 'PARAF', 'DISPOSED'], perm: 'letter.dispose' },
    complete: { on: ['DISPOSED'], perm: 'letter.complete' },
    archive: { on: ['COMPLETED'], perm: 'letter.archive' },
    upload: { on: ['RECEIVED', 'DISPOSED'], perm: 'letter.document.upload' },
  };
  return Object.keys(rules).filter(
    (a) => rules[a].on.includes(status) && can(perms, rules[a].perm),
  );
}

function toDetail(l: any, perms: string[], meId: string) {
  return {
    ...l,
    availableActions: availableActions(l.status, perms),
    dispositions: (l.dispositions ?? []).map((d: any) => ({
      id: d.id,
      from: { id: d.fromUser.id, username: d.fromUser.username },
      to: { id: d.toUser.id, username: d.toUser.username },
      targetCode: d.targetCode,
      targetName: d.targetName,
      instruction: d.instruction,
      deadline: d.deadline,
      status: d.status,
      responseNote: d.responseNote,
      respondedAt: d.respondedAt,
      createdAt: d.createdAt,
      canFollowUp: d.status === 'PENDING' && (d.toUser.id === meId || perms.includes('*')),
    })),
  };
}

// Surat terlihat oleh yang terlibat, kecuali SUPER_ADMIN/VERIFIER (semua).
function scopeWhere(meId: string, role: string): any {
  if (role === 'SUPER_ADMIN' || role === 'VERIFIER') return {};
  return {
    OR: [
      { createdBy: meId },
      { dispositions: { some: { fromUserId: meId } } },
      { dispositions: { some: { toUserId: meId } } },
    ],
  };
}

// ---------- POST /letters (JSON atau multipart + file opsional) ----------
router.post('/', requirePermission('letter.create'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const schema = z.object({
      letterNumber: z.string().min(1, 'Nomor surat wajib'),
      sender: z.string().min(1, 'Pengirim wajib'),
      subject: z.string().min(5, 'Perihal minimal 5 karakter'),
      letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      priority: z.enum(PRIORITY).optional().default('BIASA'),
      secrecy: z.enum(['SR', 'R', 'B']).optional().default('B'),
      summary: z.string().max(2000).optional(),
      addressedTo: z.string().max(200).optional(),
      pic: z.string().max(150).optional(),
      remarks: z.string().max(500).optional(),
      classificationCode: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const f = (req as any).file;
      if (f) fs.rmSync(f.path, { force: true });
      return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
    }
    const b = parsed.data;
    if (!parseYMD(b.letterDate)) return fail(res, 422, 'letterDate tidak valid');

    let classificationId: string | null = null;
    if (b.classificationCode) {
      const cls = await prisma.archiveClassification.findUnique({ where: { code: b.classificationCode } });
      if (!cls || !cls.isActive) return fail(res, 422, 'Kode klasifikasi tidak dikenal');
      classificationId = cls.id;
    }

    const count = await prisma.incomingLetter.count();
    const agendaNumber = `AGENDA-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const letter = await prisma.incomingLetter.create({
      data: {
        agendaNumber,
        letterNumber: b.letterNumber,
        sender: b.sender,
        subject: b.subject,
        letterDate: parseYMD(b.letterDate)!,
        receivedDate: parseYMD(todayYMD())!,
        priority: b.priority,
        secrecy: b.secrecy,
        summary: b.summary,
        addressedTo: b.addressedTo,
        pic: b.pic,
        remarks: b.remarks,
        classificationId,
        status: 'RECEIVED',
        createdBy: req.user!.id,
      },
    });

    const f = (req as any).file;
    if (f) {
      const ext = path.extname(f.originalname);
      const storedPath = f.path + ext;
      fs.renameSync(f.path, storedPath);
      await prisma.letterDocument.create({
        data: {
          letterId: letter.id,
          originalName: f.originalname,
          storedPath,
          mimeType: f.mimetype,
          sizeBytes: f.size,
          uploadedBy: req.user!.id,
        },
      });
    }
    const full = await prisma.incomingLetter.findUnique({ where: { id: letter.id }, include: includeDetail });
    return res.status(201).json({ success: true, message: 'Surat masuk dicatat', data: toDetail(full, req.user!.permissions, req.user!.id), meta: null, errors: null });
  });
});

// ---------- GET /letters ----------
router.get('/', requirePermission('letter.view'), async (req, res) => {
  const { status, q, page = '1', limit = '10' } = req.query as any;
  const where: any = scopeWhere(req.user!.id, req.user!.role);
  if (status) {
    if (!LETTER_STATUS.includes(status)) return fail(res, 422, 'status tidak valid');
    where.status = status;
  }
  if (q) {
    where.OR = [
      { subject: { contains: String(q), mode: 'insensitive' } },
      { sender: { contains: String(q), mode: 'insensitive' } },
      { letterNumber: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.incomingLetter.count({ where }),
    prisma.incomingLetter.findMany({
      where,
      include: { creator: { omit: { passwordHash: true } }, dispositions: { include: { fromUser: { omit: { passwordHash: true } }, toUser: { omit: { passwordHash: true } } } }, _count: { select: { documents: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- GET /letters/classifications ----------
router.get('/classifications', requirePermission('letter.view'), async (_req, res) => {
  const items = await prisma.archiveClassification.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  });
  return ok(res, items);
});

// ---------- GET /letters/disposition-targets ----------
router.get('/disposition-targets', requirePermission('letter.dispose'), async (_req, res) => {
  const items = await prisma.dispositionTarget.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return ok(res, items);
});

// ---------- GET /letters/register-book (buku agenda surat masuk) ----------
// Kolom: nomor, instansiDitujukan, noSurat, tanggalSurat, perihal, penanggungJawab, ket
router.get('/register-book', requirePermission('letter.view'), async (req, res) => {
  const { from, to } = req.query as any;
  const where: any = {};
  if (from || to) {
    where.receivedDate = {};
    if (from) {
      if (!parseYMD(from)) return fail(res, 422, 'from tidak valid');
      where.receivedDate.gte = parseYMD(from);
    }
    if (to) {
      if (!parseYMD(to)) return fail(res, 422, 'to tidak valid');
      where.receivedDate.lte = parseYMD(to);
    }
  }
  const items = await prisma.incomingLetter.findMany({
    where,
    include: { creator: { omit: { passwordHash: true } } },
    orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
    take: 1000,
  });
  const rows = items.map((l, i) => ({
    nomor: i + 1,
    instansiDitujukan: l.addressedTo ?? '-',
    noSurat: l.letterNumber,
    tanggalSurat: l.letterDate.toISOString().slice(0, 10),
    perihal: l.subject,
    penanggungJawab: l.pic ?? l.creator.username,
    ket: l.remarks ?? l.status,
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

// ---------- GET /letters/:id/disposition-sheet (lembar disposisi) ----------
router.get('/:id/disposition-sheet', requirePermission('letter.view'), async (req, res) => {
  const l = await prisma.incomingLetter.findUnique({
    where: { id: req.params.id },
    include: {
      classification: true,
      dispositions: { include: { fromUser: true, toUser: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  return ok(res, {
    nomorAgenda: l.agendaNumber,
    sifatSurat: l.secrecy,
    tanggalPenerimaan: l.receivedDate.toISOString().slice(0, 10),
    tanggalSurat: l.letterDate.toISOString().slice(0, 10),
    tanggalPenyelesaian: l.resolutionDate ? l.resolutionDate.toISOString().slice(0, 10) : null,
    tanggalDistribusi: l.distributedAt ? l.distributedAt.toISOString() : null,
    nomorSurat: l.letterNumber,
    asalSurat: l.sender,
    ringkasanIsi: l.summary,
    klasifikasi: l.classification?.code ?? null,
    disposisi: l.dispositions.map((d, i) => ({
      nomor: i + 1,
      kepada: d.targetName ?? d.toUser.username,
      instruksi: d.instruction,
      batasWaktu: d.deadline ? d.deadline.toISOString().slice(0, 10) : null,
      status: d.status,
      catatanTindakLanjut: d.responseNote,
    })),
  });
});

// ---------- POST /letters/:id/expedition (catat buku ekspedisi) ----------
router.post('/:id/expedition', requirePermission('letter.expedition'), async (req, res) => {
  const schema = z.object({
    receiverName: z.string().min(1, 'Penerima surat wajib'),
    signatureName: z.string().max(150).optional(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');

  const count = await prisma.expeditionReceipt.count();
  const regNumber = `REG-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  const receipt = await prisma.expeditionReceipt.create({
    data: {
      regNumber,
      letterId: l.id,
      receiptDate: parseYMD(todayYMD())!,
      receiverName: parsed.data.receiverName,
      signatureName: parsed.data.signatureName,
      note: parsed.data.note,
      createdBy: req.user!.id,
    },
  });
  return res.status(201).json({ success: true, message: 'Tanda terima dicatat', data: receipt, meta: null, errors: null });
});

// ---------- GET /letters/expedition-book (buku ekspedisi) ----------
// Kolom: tanggalHariIni, nomorRegis, tanggalSurat, penerimaSurat, paraf, asalSurat
router.get('/expedition-book', requirePermission('letter.view'), async (req, res) => {
  const items = await prisma.expeditionReceipt.findMany({
    include: { letter: true },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });
  const rows = items.map((e) => ({
    tanggalHariIni: e.receiptDate.toISOString().slice(0, 10),
    nomorRegis: e.regNumber,
    tanggalSurat: e.letter.letterDate.toISOString().slice(0, 10),
    penerimaSurat: e.receiverName,
    paraf: e.signatureName ?? '-',
    asalSurat: e.letter.sender,
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});
// ---------- POST /letters/:id/paraf (Sekcam memeriksa) ----------
router.post('/:id/paraf', requirePermission('letter.paraf'), async (req, res) => {
  const schema = z.object({ note: z.string().max(500).optional() });
  const note = schema.safeParse(req.body ?? {}).data?.note ?? null;
  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'RECEIVED') return fail(res, 409, `Paraf hanya dari RECEIVED (saat ini ${l.status})`);
  const updated = await prisma.incomingLetter.update({
    where: { id: l.id },
    data: { status: 'PARAF' },
    include: includeDetail,
  });
  if (note) {
    await prisma.letterDisposition.create({
      data: {
        letterId: l.id,
        fromUserId: req.user!.id,
        toUserId: req.user!.id,
        instruction: `Paraf pemeriksaan: ${note}`,
        status: 'DONE',
        responseNote: note,
        respondedAt: new Date(),
      },
    });
  }
  const full = await prisma.incomingLetter.findUnique({ where: { id: l.id }, include: includeDetail });
  return ok(res, toDetail(full ?? updated, req.user!.permissions, req.user!.id), 'Paraf pemeriksaan dicatat');
});

// ---------- GET /letters/:id ----------
router.get('/:id', requirePermission('letter.view'), async (req, res) => {
  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id }, include: includeDetail });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'VERIFIER') {
    const involved =
      l.createdBy === req.user!.id ||
      l.dispositions.some((d: any) => d.fromUserId === req.user!.id || d.toUserId === req.user!.id);
    if (!involved) return fail(res, 403, 'Surat ini bukan untukmu');
  }
  return ok(res, toDetail(l, req.user!.permissions, req.user!.id));
});

// ---------- POST /letters/:id/documents ----------
router.post('/:id/documents', requirePermission('letter.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const f = (req as any).file;
    if (!f) return fail(res, 422, 'file wajib (pdf/jpg/png, max 10MB)');
    const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id } });
    if (!l) return fail(res, 404, 'Surat tidak ditemukan');
    if (!['RECEIVED', 'DISPOSED'].includes(l.status)) return fail(res, 409, `Upload hanya saat RECEIVED/DISPOSED (saat ini ${l.status})`);
    const ext = path.extname(f.originalname);
    const storedPath = f.path + ext;
    fs.renameSync(f.path, storedPath);
    const doc = await prisma.letterDocument.create({
      data: { letterId: l.id, originalName: f.originalname, storedPath, mimeType: f.mimetype, sizeBytes: f.size, uploadedBy: req.user!.id },
    });
    return res.status(201).json({ success: true, message: 'Dokumen ditambahkan', data: doc, meta: null, errors: null });
  });
});

// ---------- POST /letters/:id/dispose ----------
router.post('/:id/dispose', requirePermission('letter.dispose'), async (req, res) => {
  const schema = z.object({
    toUserId: z.string().uuid(),
    instruction: z.string().min(5, 'Isi disposisi minimal 5 karakter'),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    targetCode: z.string().max(30).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id }, include: { dispositions: true } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (!['RECEIVED', 'PARAF', 'DISPOSED'].includes(l.status)) return fail(res, 409, `Disposisi hanya saat RECEIVED/PARAF/DISPOSED (saat ini ${l.status})`);
  if (b.toUserId === req.user!.id) return fail(res, 422, 'Tidak boleh disposisi ke diri sendiri');
  const target = await prisma.user.findUnique({ where: { id: b.toUserId } });
  if (!target || !target.isActive) return fail(res, 422, 'Penerima tidak valid/aktif');
  if (b.deadline && !parseYMD(b.deadline)) return fail(res, 422, 'deadline tidak valid');

  let targetName: string | null = null;
  if (b.targetCode) {
    const t = await prisma.dispositionTarget.findUnique({ where: { code: b.targetCode } });
    if (!t || !t.isActive) return fail(res, 422, 'targetCode tidak dikenal (lihat GET /letters/disposition-targets)');
    targetName = t.name;
  }

  const disp = await prisma.$transaction(async (tx) => {
    const d = await tx.letterDisposition.create({
      data: {
        letterId: l.id,
        fromUserId: req.user!.id,
        toUserId: b.toUserId,
        instruction: b.instruction,
        deadline: b.deadline ? parseYMD(b.deadline) : null,
        targetCode: b.targetCode ?? null,
        targetName,
        status: 'PENDING',
      },
    });
    await tx.notification.create({
      data: {
        userId: b.toUserId,
        type: 'DISPOSITION',
        title: `Disposisi baru: ${l.subject}`,
        body: `${req.user!.username} mendisposisikan "${l.subject}" kepada Anda${targetName ? ` (${targetName})` : ''}: ${b.instruction}`,
        referenceType: 'letter_disposition',
        referenceId: d.id,
      },
    });
    if (l.status === 'RECEIVED' || l.status === 'PARAF') {
      await tx.incomingLetter.update({
        where: { id: l.id },
        data: { status: 'DISPOSED', distributedAt: l.distributedAt ?? new Date() },
      });
    }
    return d;
  });
  const full = await prisma.incomingLetter.findUnique({ where: { id: l.id }, include: includeDetail });
  return res.status(201).json({ success: true, message: 'Disposisi diteruskan', data: { disposition: disp, letter: toDetail(full, req.user!.permissions, req.user!.id) }, meta: null, errors: null });
});

// ---------- POST /letters/dispositions/:dispId/followup ----------
router.post('/dispositions/:dispId/followup', requirePermission('letter.followup'), async (req, res) => {
  const schema = z.object({ note: z.string().min(3, 'Catatan tindak lanjut wajib') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const d = await prisma.letterDisposition.findUnique({ where: { id: req.params.dispId } });
  if (!d) return fail(res, 404, 'Disposisi tidak ditemukan');
  if (d.status !== 'PENDING') return fail(res, 409, 'Disposisi sudah selesai');
  if (d.toUserId !== req.user!.id && !req.user!.permissions.includes('*')) {
    return fail(res, 403, 'Hanya penerima disposisi yang boleh menindaklanjuti');
  }
  const updated = await prisma.letterDisposition.update({
    where: { id: d.id },
    data: { status: 'DONE', responseNote: parsed.data.note, respondedAt: new Date() },
  });
  return ok(res, updated, 'Tindak lanjut dicatat');
});

// ---------- POST /letters/:id/complete ----------
router.post('/:id/complete', requirePermission('letter.complete'), async (req, res) => {
  const schema = z.object({ note: z.string().optional() });
  const note = schema.safeParse(req.body ?? {}).data?.note ?? null;
  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id }, include: { dispositions: true } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'DISPOSED') return fail(res, 409, `Complete hanya dari DISPOSED (saat ini ${l.status})`);
  if (l.dispositions.length === 0) return fail(res, 409, 'Belum ada disposisi');
  if (l.dispositions.some((d) => d.status === 'PENDING')) return fail(res, 409, 'Masih ada disposisi PENDING');
  const updated = await prisma.incomingLetter.update({
    where: { id: l.id },
    data: { status: 'COMPLETED', completedAt: new Date(), completionNote: note, resolutionDate: parseYMD(todayYMD())! },
    include: includeDetail,
  });
  return ok(res, toDetail(updated, req.user!.permissions, req.user!.id), 'Surat selesai ditangani');
});

// ---------- POST /letters/:id/archive ----------
router.post('/:id/archive', requirePermission('letter.archive'), async (req, res) => {
  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'COMPLETED') return fail(res, 409, `Arsip hanya dari COMPLETED (saat ini ${l.status})`);
  const updated = await prisma.incomingLetter.update({
    where: { id: l.id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
    include: includeDetail,
  });
  return ok(res, toDetail(updated, req.user!.permissions, req.user!.id), 'Surat diarsipkan');
});

export default router;
