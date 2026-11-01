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
import {
  NumberingError,
  allocateOutgoingSequence,
  claimOutgoingBuffer,
  getNumberingStatus,
} from '../services/outgoing-numbering.service';

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

const includeDetail = {
  creator: { omit: { passwordHash: true } },
  classification: true,
  documents: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedBy: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  archiveRecord: {
    include: { list: { select: { id: true, listNumber: true, status: true } } },
  },
};

function publicDocument(d: any, letterId: string) {
  const rest = { ...d };
  delete rest.storedPath;
  return {
    ...rest,
    downloadUrl: `/api/v1/outgoing-letters/${letterId}/documents/${d.id}/download`,
  };
}

function withDocumentUrls(letter: any) {
  if (!letter) return letter;
  return {
    ...letter,
    documents: (letter.documents ?? []).map((d: any) => publicDocument(d, letter.id)),
  };
}

function notFuture(letterDate: string): boolean {
  return letterDate <= todayYMD();
}

// ---------- POST /outgoing-letters/reserve ----------
router.post('/reserve', requirePermission('outgoing.reserve'), async (req, res) => {
  const schema = z.object({
    classificationCode: z.string().min(1),
    letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(5, 'Alasan reservasi wajib (min 5 karakter)'),
    signerName: z.string().max(150).optional(),
    letterCode: z.string().max(30).optional(),
    destinationNumber: z.string().max(100).optional(),
    personInCharge: z.string().max(150).optional(),
    remarks: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  if (!parseYMD(b.letterDate)) return fail(res, 422, 'letterDate tidak valid');
  if (!notFuture(b.letterDate)) return fail(res, 422, 'Tanggal surat tidak boleh masa depan');

  try {
    const letter = await prisma.$transaction(async (tx) => {
      const cls = await tx.archiveClassification.findUnique({ where: { code: b.classificationCode } });
      if (!cls || !cls.isActive) throw new NumberingError(422, 'Kode klasifikasi tidak dikenal');
      const code = b.letterCode?.trim() || cls.code;
      const alloc = await allocateOutgoingSequence(tx, b.letterDate);
      const created = await tx.outgoingLetter.create({
        data: {
          letterNumber: formatLetterNumber(code, alloc.sequence, letterUnitCode(), b.letterDate),
          sequenceNumber: alloc.sequence,
          year: Number(b.letterDate.slice(0, 4)),
          classificationId: cls.id,
          subject: `(RESERVED) ${b.reason}`.slice(0, 500),
          letterDate: parseYMD(b.letterDate)!,
          signerName: b.signerName?.trim() || null,
          letterCode: b.letterCode?.trim() || null,
          destinationNumber: b.destinationNumber?.trim() || null,
          personInCharge: b.personInCharge?.trim() || null,
          remarks: b.remarks?.trim() || null,
          status: 'RESERVED',
          reservationReason: b.reason,
          reservedBy: req.user!.id,
          reservedAt: new Date(),
          createdBy: req.user!.id,
        },
      });
      await claimOutgoingBuffer(tx, alloc.bufferId, created.id);
      return tx.outgoingLetter.findUniqueOrThrow({ where: { id: created.id }, include: includeDetail });
    });
    return res.status(201).json({ success: true, message: 'Nomor berhasil direservasi', data: withDocumentUrls(letter), meta: null, errors: null });
  } catch (e: any) {
    if (e instanceof NumberingError) return fail(res, e.status, e.message);
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor bentrok, ulangi reservasi');
    throw e;
  }
});

// ---------- POST /outgoing-letters (normal, langsung ISSUED; JSON atau multipart) ----------
router.post('/', requirePermission('outgoing.create'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    const f = (req as any).file;
    const cleanupFile = () => {
      if (!f) return;
      fs.rmSync(f.path, { force: true });
    };
    if (err) {
      cleanupFile();
      return fail(res, 400, err.message);
    }

    const schema = z.object({
      classificationCode: z.string().min(1),
      subject: z.string().min(5, 'Perihal minimal 5 karakter'),
      recipient: z.string().min(1, 'Tujuan surat wajib'),
      letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      priority: z.enum(['BIASA', 'SEGERA', 'SANGAT_SEGERA']).optional().default('BIASA'),
      secrecy: z.enum(['SR', 'R', 'B']).optional().default('B'),
      signerName: z.string().max(150).optional(),
      letterCode: z.string().max(30).optional(),
      destinationNumber: z.string().max(100).optional(),
      personInCharge: z.string().max(150).optional(),
      remarks: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      cleanupFile();
      return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
    }
    const b = parsed.data;
    const dateStr = b.letterDate ?? todayYMD();
    if (!parseYMD(dateStr)) {
      cleanupFile();
      return fail(res, 422, 'letterDate tidak valid');
    }
    if (!notFuture(dateStr)) {
      cleanupFile();
      return fail(res, 422, 'Tanggal surat tidak boleh masa depan');
    }

    let storedPath: string | null = null;
    try {
      const letter = await prisma.$transaction(async (tx) => {
        const cls = await tx.archiveClassification.findUnique({ where: { code: b.classificationCode } });
        if (!cls || !cls.isActive) throw new NumberingError(422, 'Kode klasifikasi tidak dikenal');
        const code = b.letterCode?.trim() || cls.code;
        const alloc = await allocateOutgoingSequence(tx, dateStr);
        const created = await tx.outgoingLetter.create({
          data: {
            letterNumber: formatLetterNumber(code, alloc.sequence, letterUnitCode(), dateStr),
            sequenceNumber: alloc.sequence,
            year: Number(dateStr.slice(0, 4)),
            classificationId: cls.id,
            subject: b.subject,
            recipient: b.recipient,
            destinationNumber: b.destinationNumber?.trim() || null,
            personInCharge: b.personInCharge?.trim() || null,
            letterCode: b.letterCode?.trim() || null,
            remarks: b.remarks?.trim() || null,
            letterDate: parseYMD(dateStr)!,
            priority: b.priority,
            secrecy: b.secrecy,
            signerName: b.signerName?.trim() || null,
            status: 'ISSUED',
            issuedAt: new Date(),
            createdBy: req.user!.id,
          },
        });
        await claimOutgoingBuffer(tx, alloc.bufferId, created.id);

        if (f) {
          const ext = path.extname(f.originalname);
          storedPath = f.path + ext;
          fs.renameSync(f.path, storedPath);
          await tx.outgoingDocument.create({
            data: {
              letterId: created.id,
              originalName: f.originalname,
              storedPath,
              mimeType: f.mimetype,
              sizeBytes: f.size,
              uploadedBy: req.user!.id,
            },
          });
        }
        return tx.outgoingLetter.findUniqueOrThrow({ where: { id: created.id }, include: includeDetail });
      });
      return res.status(201).json({ success: true, message: 'Surat keluar diterbitkan', data: withDocumentUrls(letter), meta: null, errors: null });
    } catch (e: any) {
      cleanupFile();
      if (storedPath) fs.rmSync(storedPath, { force: true });
      if (e instanceof NumberingError) return fail(res, e.status, e.message);
      if (e?.code === 'P2002') return fail(res, 409, 'Nomor bentrok, ulangi');
      throw e;
    }
  });
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
    letterCode: z.string().max(30).optional(),
    destinationNumber: z.string().max(100).optional(),
    personInCharge: z.string().max(150).optional(),
    remarks: z.string().max(500).optional(),
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
  const code = b.letterCode?.trim() || l.letterCode || cls!.code;
  const updated = await prisma.outgoingLetter.update({
    where: { id: l.id },
    data: {
      letterNumber: formatLetterNumber(code, l.sequenceNumber, letterUnitCode(), dateStr),
      subject: b.subject ?? (l.subject.startsWith('(RESERVED)') ? 'Surat keluar' : l.subject),
      recipient: b.recipient,
      letterDate: parseYMD(dateStr)!,
      ...(b.letterCode !== undefined ? { letterCode: b.letterCode?.trim() || null } : {}),
      ...(b.destinationNumber !== undefined ? { destinationNumber: b.destinationNumber?.trim() || null } : {}),
      ...(b.personInCharge !== undefined ? { personInCharge: b.personInCharge?.trim() || null } : {}),
      ...(b.remarks !== undefined ? { remarks: b.remarks?.trim() || null } : {}),
      ...(b.priority ? { priority: b.priority } : {}),
      ...(b.secrecy ? { secrecy: b.secrecy } : {}),
      ...(b.signerName !== undefined ? { signerName: b.signerName?.trim() || null } : {}),
      status: 'ISSUED',
      issuedAt: new Date(),
    },
    include: includeDetail,
  });
  return ok(res, withDocumentUrls(updated), 'Reservasi diterbitkan (nomor tetap)');
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
  return ok(res, withDocumentUrls(updated), 'Reservasi dibatalkan (nomor tidak dipakai ulang)');
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
    return res.status(201).json({ success: true, message: 'Dokumen ditambahkan', data: publicDocument(doc, l.id), meta: null, errors: null });
  });
});

// ---------- GET /outgoing-letters/:id/documents/:docId/download ----------
router.get('/:id/documents/:docId/download', requirePermission('outgoing.view'), async (req, res) => {
  const doc = await prisma.outgoingDocument.findFirst({
    where: { id: req.params.docId, letterId: req.params.id },
  });
  if (!doc || !fs.existsSync(doc.storedPath)) return fail(res, 404, 'Dokumen tidak ditemukan');
  return res.download(doc.storedPath, doc.originalName);
});

// ---------- GET /outgoing-letters/register-book (buku agenda keluar) ----------
router.get('/register-book', requirePermission('outgoing.view'), async (req, res) => {
  const { year, from, to, q, status } = req.query as any;
  const y = year ? Number(year) : new Date().getFullYear();
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return fail(res, 422, 'year tidak valid');

  const where: any = { year: y };
  if (status) {
    if (!OUT_STATUS.includes(status)) return fail(res, 422, 'status tidak valid');
    where.status = status;
  }
  if (from || to) {
    where.letterDate = {};
    if (from) {
      const d = parseYMD(String(from));
      if (!d) return fail(res, 422, 'from tidak valid');
      where.letterDate.gte = d;
    }
    if (to) {
      const d = parseYMD(String(to));
      if (!d) return fail(res, 422, 'to tidak valid');
      where.letterDate.lte = d;
    }
  }
  if (q) {
    where.OR = [
      { subject: { contains: String(q), mode: 'insensitive' } },
      { letterNumber: { contains: String(q), mode: 'insensitive' } },
      { recipient: { contains: String(q), mode: 'insensitive' } },
      { destinationNumber: { contains: String(q), mode: 'insensitive' } },
      { personInCharge: { contains: String(q), mode: 'insensitive' } },
      { letterCode: { contains: String(q), mode: 'insensitive' } },
      { remarks: { contains: String(q), mode: 'insensitive' } },
    ];
  }

  const items = await prisma.outgoingLetter.findMany({
    where,
    include: { classification: true, creator: { omit: { passwordHash: true } } },
    orderBy: [{ sequenceNumber: 'asc' }, { createdAt: 'asc' }],
    take: 2000,
  });
  const rows = items.map((l, i) => ({
    nomor: i + 1,
    nomorUrut: l.sequenceNumber,
    instansiDituju: l.recipient ?? '-',
    tujuan: l.recipient ?? '-',
    nomorTujuan: l.destinationNumber ?? '-',
    nomorSurat: l.letterNumber,
    tanggalSurat: l.letterDate.toISOString().slice(0, 10),
    tanggalCatat: l.createdAt.toISOString().slice(0, 10),
    perihal: l.subject,
    penanggungJawab: l.personInCharge ?? l.creator.username,
    kodeSurat: l.letterCode ?? l.classification.code,
    klasifikasi: l.classification.code,
    penandatangan: l.signerName ?? '-',
    ket: l.remarks ?? l.status,
    keterangan: l.remarks ?? l.status,
    status: l.status,
  }));
  return ok(res, rows, 'ok', { year: y, total: rows.length });
});

// ---------- GET /outgoing-letters/numbering (status nomor & buffer backdate) ----------
router.get('/numbering', requirePermission('outgoing.view'), async (req, res) => {
  const year = Number((req.query as any).year) || new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return fail(res, 422, 'year tidak valid');
  }
  return ok(res, await getNumberingStatus(prisma, year));
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
      { destinationNumber: { contains: String(q), mode: 'insensitive' } },
      { personInCharge: { contains: String(q), mode: 'insensitive' } },
      { letterCode: { contains: String(q), mode: 'insensitive' } },
      { remarks: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.outgoingLetter.count({ where }),
    prisma.outgoingLetter.findMany({
      where,
      include: {
        classification: true,
        creator: { omit: { passwordHash: true } },
        archiveRecord: { select: { id: true, archiveNumber: true, listId: true } },
      },
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
  return ok(res, withDocumentUrls(l));
});

export default router;
