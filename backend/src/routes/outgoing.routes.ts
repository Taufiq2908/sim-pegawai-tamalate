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
import { formatLetterNumber, letterUnitCode } from '../services/numbering.service';

const router = Router();
router.use(authRequired);

const OUT_STATUS = ['RESERVED', 'ISSUED', 'CANCELLED'] as const;

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: 10_000_000 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const includeDetail = { creator: true, classification: true, documents: true };

function notFuture(letterDate: string): boolean {
  return letterDate <= todayYMD();
}

// Alokasi nomor urut berikutnya untuk tahun berjalan (UNIQUE guard terhadap balapan).
async function nextSequence(year: number): Promise<number> {
  const last = await prisma.outgoingLetter.findFirst({
    where: { year },
    orderBy: { sequenceNumber: 'desc' },
    select: { sequenceNumber: true },
  });
  return (last?.sequenceNumber ?? 0) + 1;
}

async function buildNumber(classificationId: string, sequence: number, letterDate: string) {
  const cls = await prisma.archiveClassification.findUnique({ where: { id: classificationId } });
  if (!cls || !cls.isActive) return null;
  const year = Number(letterDate.slice(0, 4));
  return {
    letterNumber: formatLetterNumber(cls.code, sequence, letterUnitCode(), letterDate),
    year,
  };
}

// ---------- POST /outgoing-letters/reserve ----------
router.post('/reserve', requirePermission('outgoing.reserve'), async (req, res) => {
  const schema = z.object({
    classificationCode: z.string().min(1),
    letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(5, 'Alasan reservasi wajib (min 5 karakter)'),
    signerName: z.string().max(150).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  if (!parseYMD(b.letterDate)) return fail(res, 422, 'letterDate tidak valid');
  if (!notFuture(b.letterDate)) return fail(res, 422, 'Tanggal surat tidak boleh masa depan');

  const cls = await prisma.archiveClassification.findUnique({ where: { code: b.classificationCode } });
  if (!cls || !cls.isActive) return fail(res, 422, 'Kode klasifikasi tidak dikenal');
  const year = Number(b.letterDate.slice(0, 4));

  try {
    const letter = await prisma.outgoingLetter.create({
      data: {
        letterNumber: formatLetterNumber(cls.code, await nextSequence(year), letterUnitCode(), b.letterDate),
        sequenceNumber: await nextSequence(year),
        year,
        classificationId: cls.id,
        subject: `(RESERVED) ${b.reason}`.slice(0, 500),
        letterDate: parseYMD(b.letterDate)!,
        signerName: b.signerName,
        status: 'RESERVED',
        reservationReason: b.reason,
        reservedBy: req.user!.id,
        reservedAt: new Date(),
        createdBy: req.user!.id,
      },
      include: includeDetail,
    });
    return res.status(201).json({ success: true, message: 'Nomor berhasil direservasi', data: letter, meta: null, errors: null });
  } catch (e: any) {
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor bentrok, ulangi reservasi');
    throw e;
  }
});

// ---------- POST /outgoing-letters (normal, langsung ISSUED) ----------
router.post('/', requirePermission('outgoing.create'), async (req, res) => {
  const schema = z.object({
    classificationCode: z.string().min(1),
    subject: z.string().min(5, 'Perihal minimal 5 karakter'),
    recipient: z.string().min(1, 'Tujuan surat wajib'),
    letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(['BIASA', 'SEGERA', 'SANGAT_SEGERA']).optional().default('BIASA'),
    secrecy: z.enum(['SR', 'R', 'B']).optional().default('B'),
    signerName: z.string().max(150).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const dateStr = b.letterDate ?? todayYMD();
  if (!parseYMD(dateStr)) return fail(res, 422, 'letterDate tidak valid');
  if (!notFuture(dateStr)) return fail(res, 422, 'Tanggal surat tidak boleh masa depan');

  const cls = await prisma.archiveClassification.findUnique({ where: { code: b.classificationCode } });
  if (!cls || !cls.isActive) return fail(res, 422, 'Kode klasifikasi tidak dikenal');
  const year = Number(dateStr.slice(0, 4));

  try {
    const seq = await nextSequence(year);
    const letter = await prisma.outgoingLetter.create({
      data: {
        letterNumber: formatLetterNumber(cls.code, seq, letterUnitCode(), dateStr),
        sequenceNumber: seq,
        year,
        classificationId: cls.id,
        subject: b.subject,
        recipient: b.recipient,
        letterDate: parseYMD(dateStr)!,
        priority: b.priority,
        secrecy: b.secrecy,
        signerName: b.signerName,
        status: 'ISSUED',
        issuedAt: new Date(),
        createdBy: req.user!.id,
      },
      include: includeDetail,
    });
    return res.status(201).json({ success: true, message: 'Surat keluar diterbitkan', data: letter, meta: null, errors: null });
  } catch (e: any) {
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor bentrok, ulangi');
    throw e;
  }
});

// ---------- POST /outgoing-letters/:id/issue (lengkapi reservasi) ----------
router.post('/:id/issue', requirePermission('outgoing.issue'), async (req, res) => {
  const schema = z.object({
    subject: z.string().min(5).optional(),
    recipient: z.string().min(1, 'Tujuan surat wajib'),
    letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(['BIASA', 'SEGERA', 'SANGAT_SEGERA']).optional(),
    secrecy: z.enum(['SR', 'R', 'B']).optional(),
    signerName: z.string().max(150).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'RESERVED') return fail(res, 409, `Hanya RESERVED yang bisa diterbitkan (saat ini ${l.status})`);

  const dateStr = b.letterDate ?? l.letterDate.toISOString().slice(0, 10);
  if (!parseYMD(dateStr)) return fail(res, 422, 'letterDate tidak valid');
  if (!notFuture(dateStr)) return fail(res, 422, 'Tanggal surat tidak boleh masa depan');

  // Nomor tetap: hanya tanggal boleh dikoreksi → nomor dihitung ulang dari tanggal final
  // agar segmen bulan/tahun konsisten, TANPA mengubah sequence.
  const cls = await prisma.archiveClassification.findUnique({ where: { id: l.classificationId } });
  const updated = await prisma.outgoingLetter.update({
    where: { id: l.id },
    data: {
      letterNumber: formatLetterNumber(cls!.code, l.sequenceNumber, letterUnitCode(), dateStr),
      subject: b.subject ?? (l.subject.startsWith('(RESERVED)') ? 'Surat keluar' : l.subject),
      recipient: b.recipient,
      letterDate: parseYMD(dateStr)!,
      ...(b.priority ? { priority: b.priority } : {}),
      ...(b.secrecy ? { secrecy: b.secrecy } : {}),
      ...(b.signerName ? { signerName: b.signerName } : {}),
      status: 'ISSUED',
      issuedAt: new Date(),
    },
    include: includeDetail,
  });
  return ok(res, updated, 'Reservasi diterbitkan (nomor tetap)');
});

// ---------- POST /outgoing-letters/:id/cancel ----------
router.post('/:id/cancel', requirePermission('outgoing.cancel'), async (req, res) => {
  const schema = z.object({ reason: z.string().min(5, 'Alasan pembatalan wajib') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'RESERVED') return fail(res, 409, 'Hanya RESERVED yang bisa dibatalkan (nomor ISSUED tidak dapat dipakai ulang/dihapus)');
  const updated = await prisma.outgoingLetter.update({
    where: { id: l.id },
    data: { status: 'CANCELLED', cancelReason: parsed.data.reason, cancelledAt: new Date() },
    include: includeDetail,
  });
  return ok(res, updated, 'Reservasi dibatalkan (nomor tidak dipakai ulang)');
});

// ---------- POST /outgoing-letters/:id/documents ----------
router.post('/:id/documents', requirePermission('outgoing.create'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const f = (req as any).file;
    if (!f) return fail(res, 422, 'file wajib (pdf/jpg/png, max 10MB)');
    const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id } });
    if (!l) return fail(res, 404, 'Surat tidak ditemukan');
    if (l.status === 'CANCELLED') return fail(res, 409, 'Surat dibatalkan');
    const ext = path.extname(f.originalname);
    const storedPath = f.path + ext;
    fs.renameSync(f.path, storedPath);
    const doc = await prisma.outgoingDocument.create({
      data: { letterId: l.id, originalName: f.originalname, storedPath, mimeType: f.mimetype, sizeBytes: f.size, uploadedBy: req.user!.id },
    });
    return res.status(201).json({ success: true, message: 'Dokumen ditambahkan', data: doc, meta: null, errors: null });
  });
});

// ---------- GET /outgoing-letters/register-book (buku agenda keluar) ----------
router.get('/register-book', requirePermission('outgoing.view'), async (req, res) => {
  const { year } = req.query as any;
  const y = year ? Number(year) : new Date().getFullYear();
  const items = await prisma.outgoingLetter.findMany({
    where: { year: y },
    include: { classification: true },
    orderBy: { sequenceNumber: 'asc' },
    take: 2000,
  });
  const rows = items.map((l, i) => ({
    nomor: i + 1,
    nomorSurat: l.letterNumber,
    tanggalSurat: l.letterDate.toISOString().slice(0, 10),
    tanggalCatat: l.createdAt.toISOString().slice(0, 10),
    tujuan: l.recipient ?? '-',
    perihal: l.subject,
    klasifikasi: l.classification.code,
    penandatangan: l.signerName ?? '-',
    status: l.status,
  }));
  return ok(res, rows, 'ok', { year: y, total: rows.length });
});

// ---------- GET /outgoing-letters ----------
router.get('/', requirePermission('outgoing.view'), async (req, res) => {
  const { status, q, page = '1', limit = '10' } = req.query as any;
  const where: any = {};
  if (status) {
    if (!OUT_STATUS.includes(status)) return fail(res, 422, 'status tidak valid');
    where.status = status;
  }
  if (q) {
    where.OR = [
      { subject: { contains: String(q), mode: 'insensitive' } },
      { letterNumber: { contains: String(q), mode: 'insensitive' } },
      { recipient: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.outgoingLetter.count({ where }),
    prisma.outgoingLetter.findMany({
      where,
      include: { classification: true, creator: true },
      orderBy: [{ year: 'desc' }, { sequenceNumber: 'desc' }],
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- GET /outgoing-letters/:id ----------
router.get('/:id', requirePermission('outgoing.view'), async (req, res) => {
  const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id }, include: includeDetail });
  if (!l) return fail(res, 404, 'Surat keluar tidak ditemukan');
  return ok(res, l);
});

export default router;
