import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { deleteStoredFile, sendStoredFile, storeUploadedFile } from '../lib/storage';
import { authRequired, requirePermission } from '../middleware/auth';
import { can } from '../lib/permissions';
import { ok, fail } from '../utils/response';
import { todayYMD, parseYMD } from '../services/attendance.service';
import { formatLetterNumber, letterUnitCode } from '../services/numbering.service';
import { userHoldsPosition } from '../services/position.service';
import {
  NumberingError,
  allocateOutgoingSequence,
  claimOutgoingBuffer,
  getNumberingStatus,
} from '../services/outgoing-numbering.service';
import { ArchiveError, createArchiveRecord } from '../services/archive.service';
import { notifyArchiveApprovers, notifyUser } from '../services/notification.service';
import {
  OutgoingExpeditionError,
  markOutgoingExpeditionReceived,
  markOutgoingExpeditionSent,
  outgoingExpeditionStatus,
  publicOutgoingExpedition,
} from '../services/outgoing-expedition.service';

const router = Router();
router.use(authRequired);

const OUT_STATUS = ['RESERVED', 'TERKIRIM', 'DIARSIPKAN', 'CANCELLED'] as const;
const ARCHIVE_BATCH_MAX = 15;

// Approver arsip: Sekcam atau Camat (termasuk Plt aktif). SUPER_ADMIN tetap boleh.
async function isArchiveApprover(req: any): Promise<boolean> {
  if (req.user?.role === 'SUPER_ADMIN') return true;
  const [sekcam, camat] = await Promise.all([
    userHoldsPosition(req.user!.id, 'SEKCAM'),
    userHoldsPosition(req.user!.id, 'CAMAT'),
  ]);
  return sekcam || camat;
}

function notifyOutgoingArchiveQueue(letter: { id: string; letterNumber: string; subject: string; recipient: string | null }) {
  return notifyArchiveApprovers({
    title: `Antrean arsip: ${letter.subject}`,
    body: `Surat keluar ${letter.letterNumber} kepada ${letter.recipient ?? '-'} siap disetujui untuk diarsipkan.`,
    referenceType: 'outgoing_letter',
    referenceId: letter.id,
  }).catch(() => undefined);
}

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: 10_000_000 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('File surat harus PDF/JPG/PNG'));
    }
    cb(null, true);
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
  outgoingExpedition: true,
  kgbRequest: { select: { id: true, requestNumber: true, status: true } },
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

/**
 * Aksi surat keluar dari backend, sejajar dengan availableActions surat masuk.
 * Frontend tidak perlu menebak dari status + permission.
 */
function outgoingAvailableActions(letter: any, perms: string[]): string[] {
  const actions: string[] = [];
  if (letter.status === 'RESERVED') {
    if (can(perms, 'outgoing.issue')) actions.push('issue');
    if (can(perms, 'outgoing.cancel')) actions.push('cancel');
  }
  if (letter.status !== 'CANCELLED' && can(perms, 'outgoing.create')) actions.push('upload');
  if (letter.status === 'TERKIRIM' && letter.archiveRejectedAt && can(perms, 'outgoing.issue')) {
    actions.push('resubmit_archive');
  }
  if (letter.status === 'TERKIRIM' && can(perms, 'outgoing.issue')) {
    const expedition = letter.outgoingExpedition;
    if (!expedition) actions.push('record_expedition');
    else if (!expedition.receivedDate) actions.push(expedition.sentAt ? 'mark_expedition_received' : 'mark_expedition_sent');
  }
  return actions;
}

function withOutgoingView(letter: any, user: any) {
  return {
    ...withDocumentUrls(letter),
    outgoingExpedition: publicOutgoingExpedition(letter.outgoingExpedition),
    expeditionStatus: outgoingExpeditionStatus(letter.outgoingExpedition),
    availableActions: outgoingAvailableActions(letter, user.permissions ?? []),
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
    return res.status(201).json({ success: true, message: 'Nomor berhasil direservasi', data: withOutgoingView(letter, req.user!), meta: null, errors: null });
  } catch (e: any) {
    if (e instanceof NumberingError) return fail(res, e.status, e.message);
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor bentrok, ulangi reservasi');
    throw e;
  }
});

// ---------- POST /outgoing-letters/reserve-bulk (booking beberapa nomor) ----------
router.post('/reserve-bulk', requirePermission('outgoing.reserve'), async (req, res) => {
  const schema = z.object({
    count: z.coerce.number().int().min(1, 'Minimal 1 nomor').max(50, 'Maksimal 50 nomor per booking'),
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
    const letters = await prisma.$transaction(async (tx) => {
      const cls = await tx.archiveClassification.findUnique({ where: { code: b.classificationCode } });
      if (!cls || !cls.isActive) throw new NumberingError(422, 'Kode klasifikasi tidak dikenal');
      const code = b.letterCode?.trim() || cls.code;
      const createdIds: string[] = [];
      for (let i = 0; i < b.count; i++) {
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
        createdIds.push(created.id);
      }
      return tx.outgoingLetter.findMany({
        where: { id: { in: createdIds } },
        include: includeDetail,
        orderBy: { sequenceNumber: 'asc' },
      });
    });
    return res.status(201).json({
      success: true,
      message: `${letters.length} nomor berhasil direservasi`,
      data: letters.map((letter) => withOutgoingView(letter, req.user!)),
      meta: null,
      errors: null,
    });
  } catch (e: any) {
    if (e instanceof NumberingError) return fail(res, e.status, e.message);
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor bentrok, ulangi reservasi');
    throw e;
  }
});

// ---------- POST /outgoing-letters (normal, langsung TERKIRIM; JSON atau multipart) ----------
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
            status: 'TERKIRIM',
            issuedAt: new Date(),
            createdBy: req.user!.id,
          },
        });
        await claimOutgoingBuffer(tx, alloc.bufferId, created.id);

        if (f) {
          storedPath = await storeUploadedFile(f, `letters/outgoing/${created.id}`);
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
      await notifyOutgoingArchiveQueue(letter);
      return res.status(201).json({ success: true, message: 'Surat keluar diterbitkan', data: withOutgoingView(letter, req.user!), meta: null, errors: null });
    } catch (e: any) {
      cleanupFile();
      if (storedPath) await deleteStoredFile(storedPath).catch(() => undefined);
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
      status: 'TERKIRIM',
      issuedAt: new Date(),
    },
    include: includeDetail,
  });
  await notifyOutgoingArchiveQueue(updated);
  return ok(res, withOutgoingView(updated, req.user!), 'Reservasi diterbitkan (nomor tetap)');
});

// ---------- POST /outgoing-letters/:id/cancel ----------
router.post('/:id/cancel', requirePermission('outgoing.cancel'), async (req, res) => {
  const schema = z.object({ reason: z.string().min(5, 'Alasan pembatalan wajib') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'RESERVED') return fail(res, 409, 'Hanya RESERVED yang bisa dibatalkan (nomor TERKIRIM tidak dapat dipakai ulang/dihapus)');
  const updated = await prisma.outgoingLetter.update({
    where: { id: l.id },
    data: { status: 'CANCELLED', cancelReason: parsed.data.reason, cancelledAt: new Date() },
    include: includeDetail,
  });
  return ok(res, withOutgoingView(updated, req.user!), 'Reservasi dibatalkan (nomor tidak dipakai ulang)');
});

// ---------- POST /outgoing-letters/:id/documents ----------
router.post('/:id/documents', requirePermission('outgoing.create'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const f = (req as any).file;
    if (!f) return fail(res, 422, 'file wajib (pdf/jpg/png, max 10MB)');
    const cleanupTemp = () => { try { fs.rmSync(f.path, { force: true }); } catch { /* best-effort */ } };
    const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id } });
    if (!l) {
      cleanupTemp();
      return fail(res, 404, 'Surat tidak ditemukan');
    }
    if (l.status === 'CANCELLED') {
      cleanupTemp();
      return fail(res, 409, 'Surat dibatalkan');
    }
    const storedPath = await storeUploadedFile(f, `letters/outgoing/${l.id}`);
    try {
      const doc = await prisma.outgoingDocument.create({
        data: { letterId: l.id, originalName: f.originalname, storedPath, mimeType: f.mimetype, sizeBytes: f.size, uploadedBy: req.user!.id },
      });
      return res.status(201).json({ success: true, message: 'Dokumen ditambahkan', data: publicDocument(doc, l.id), meta: null, errors: null });
    } catch (e) {
      await deleteStoredFile(storedPath).catch(() => undefined);
      throw e;
    }
  });
});

// ---------- GET /outgoing-letters/:id/documents/:docId/download ----------
router.get('/:id/documents/:docId/download', requirePermission('outgoing.view'), async (req, res) => {
  const doc = await prisma.outgoingDocument.findFirst({
    where: { id: req.params.docId, letterId: req.params.id },
  });
  if (!doc) return fail(res, 404, 'Dokumen tidak ditemukan');
  if (!(await sendStoredFile(res, doc.storedPath, doc.originalName, doc.mimeType))) return fail(res, 404, 'Dokumen tidak ditemukan');
  return;
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
    include: { classification: true, creator: { omit: { passwordHash: true } }, outgoingExpedition: true },
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
    ekspedisi: outgoingExpeditionStatus(l.outgoingExpedition),
    ekspedisiReg: l.outgoingExpedition?.regNumber ?? null,
    ekspedisiDiterima: l.outgoingExpedition?.receivedDate
      ? l.outgoingExpedition.receivedDate.toISOString().slice(0, 10)
      : null,
  }));
  return ok(res, rows, 'ok', { year: y, total: rows.length });
});

// ---------- GET /outgoing-letters/expedition-book (buku ekspedisi keluar) ----------
// Buku tersendiri, bukan buku agenda surat keluar. Baris berasal dari surat
// keluar TERKIRIM; status menunjukkan belum dicatat, belum dikirim, dikirim,
// atau sudah diterima instansi tujuan.
router.get('/expedition-book', requirePermission('outgoing.view'), async (req, res) => {
  const { year, from, to, q, status } = req.query as any;
  const y = year ? Number(year) : new Date().getFullYear();
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return fail(res, 422, 'year tidak valid');
  // Buku ekspedisi secara default hanya menampilkan surat yang sudah punya
  // baris ekspedisi. Surat yang belum dicatat tetap bisa dimunculkan untuk
  // monitoring dengan includeUnrecorded=1 (atau filter status BELUM_DICATAT).
  const includeUnrecorded = String(req.query.includeUnrecorded ?? '') === '1' || status === 'BELUM_DICATAT';

  const where: any = { status: 'TERKIRIM', year: y };
  if (!includeUnrecorded) where.outgoingExpedition = { isNot: null };
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
      { outgoingExpedition: { is: { regNumber: { contains: String(q), mode: 'insensitive' } } } },
      { outgoingExpedition: { is: { receiptNumber: { contains: String(q), mode: 'insensitive' } } } },
    ];
  }
  if (status === 'BELUM_DICATAT') where.outgoingExpedition = { is: null };
  else if (status === 'BELUM_DIKIRIM') where.outgoingExpedition = { is: { sentAt: null } };
  else if (status === 'DIKIRIM') where.outgoingExpedition = { is: { sentAt: { not: null }, receivedDate: null } };
  else if (status === 'DITERIMA') where.outgoingExpedition = { is: { receivedDate: { not: null } } };
  else if (status) return fail(res, 422, 'status ekspedisi tidak valid');

  const items = await prisma.outgoingLetter.findMany({
    where,
    include: {
      classification: { select: { code: true, name: true } },
      outgoingExpedition: true,
    },
    orderBy: [{ letterDate: 'asc' }, { sequenceNumber: 'asc' }],
    take: 2000,
  });

  const rows = items.map((l) => {
    const exp = l.outgoingExpedition;
    return {
      // Kontrak kanonik.
      id: exp?.id ?? null,
      letterId: l.id,
      regNumber: exp?.regNumber ?? null,
      sentDate: exp?.sentAt ? exp.sentAt.toISOString().slice(0, 10) : null,
      courierName: exp?.courierName ?? null,
      recipientName: exp?.recipientName ?? l.recipient ?? null,
      receiptNumber: exp?.receiptNumber ?? null,
      receivedDate: exp?.receivedDate ? exp.receivedDate.toISOString().slice(0, 10) : null,
      receivedByName: exp?.receivedByName ?? null,
      note: exp?.note ?? null,
      status: outgoingExpeditionStatus(exp),
      // Alias bahasa Indonesia untuk tabel cetak.
      nomorRegis: exp?.regNumber ?? '—',
      nomorSurat: l.letterNumber,
      tanggalSurat: l.letterDate.toISOString().slice(0, 10),
      perihal: l.subject,
      asalSurat: 'Kecamatan Tamalate',
      instansiTujuan: l.recipient ?? '—',
      penerimaSurat: exp?.receivedByName ?? exp?.recipientName ?? l.recipient ?? '—',
      catatan: exp?.note ?? null,
      klasifikasi: l.classification?.code ?? null,
    };
  });

  return ok(res, rows, 'ok', { year: y, total: rows.length, includeUnrecorded });
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

// ---------- GET /outgoing-letters/archive-queue (antrean arsip surat keluar) ----------
router.get('/archive-queue', requirePermission('archive.approve'), async (req, res) => {
  if (!(await isArchiveApprover(req))) {
    return fail(res, 403, 'Antrean arsip hanya untuk Sekcam/Camat');
  }
  const { q, page = '1', limit = '15' } = req.query as any;
  const where: any = { status: 'TERKIRIM', archiveRecord: { is: null }, archiveRejectedAt: null };
  if (q) {
    where.OR = [
      { subject: { contains: String(q), mode: 'insensitive' } },
      { letterNumber: { contains: String(q), mode: 'insensitive' } },
      { recipient: { contains: String(q), mode: 'insensitive' } },
      { destinationNumber: { contains: String(q), mode: 'insensitive' } },
      { personInCharge: { contains: String(q), mode: 'insensitive' } },
      { letterCode: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(50, Math.max(1, Number(limit) || 15));
  const [total, items] = await Promise.all([
    prisma.outgoingLetter.count({ where }),
    prisma.outgoingLetter.findMany({
      where,
      select: {
        id: true,
        letterNumber: true,
        subject: true,
        recipient: true,
        letterDate: true,
        issuedAt: true,
        status: true,
        classification: { select: { code: true, name: true } },
      },
      orderBy: [{ issuedAt: 'asc' }, { letterDate: 'asc' }],
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  const rows = items.map((l) => ({
    // Kontrak kanonik, sama dengan endpoint surat keluar lain.
    id: l.id,
    letterNumber: l.letterNumber,
    subject: l.subject,
    recipient: l.recipient,
    letterDate: l.letterDate.toISOString().slice(0, 10),
    issuedAt: l.issuedAt ? l.issuedAt.toISOString() : null,
    status: l.status,
    classification: l.classification ?? null,
    archiveRecord: null,
    // Alias lama dipertahankan untuk UI yang sudah berjalan.
    nomor: l.letterNumber,
    nomorSurat: l.letterNumber,
    perihal: l.subject,
    asalTujuan: l.recipient,
    tanggalSelesai: (l.issuedAt ?? l.letterDate).toISOString().slice(0, 10),
    tanggalSurat: l.letterDate.toISOString().slice(0, 10),
    klasifikasi: l.classification?.code ?? null,
  }));
  return ok(res, rows, 'ok', { page: p, limit: l, total });
});

// ---------- POST /outgoing-letters/archive-approvals/batch (approve arsip surat keluar) ----------
router.post('/archive-approvals/batch', requirePermission('archive.approve'), async (req, res) => {
  if (!(await isArchiveApprover(req))) {
    return fail(res, 403, 'Persetujuan arsip hanya untuk Sekcam/Camat');
  }
  const schema = z.object({
    ids: z.array(z.string().uuid()).min(1, 'Pilih minimal 1 surat').max(ARCHIVE_BATCH_MAX, `Maksimal ${ARCHIVE_BATCH_MAX} surat per batch`),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const approved: Array<{ id: string; archiveNumber: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const id of parsed.data.ids) {
    if (seen.has(id)) {
      skipped.push({ id, reason: 'ID duplikat dalam batch' });
      continue;
    }
    seen.add(id);
    try {
      const letter = await prisma.outgoingLetter.findUnique({
        where: { id },
        include: { archiveRecord: { select: { id: true } } },
      });
      if (!letter) {
        skipped.push({ id, reason: 'Surat tidak ditemukan' });
        continue;
      }
      if (letter.status !== 'TERKIRIM') {
        skipped.push({ id, reason: `Status bukan TERKIRIM (saat ini ${letter.status})` });
        continue;
      }
      if (letter.archiveRecord) {
        skipped.push({ id, reason: 'Surat sudah memiliki record arsip' });
        continue;
      }
      const record = await createArchiveRecord({
        sourceType: 'OUTGOING',
        sourceId: id,
        actorId: req.user!.id,
      });
      approved.push({ id, archiveNumber: record.archiveNumber });
    } catch (err) {
      skipped.push({
        id,
        reason: err instanceof ArchiveError ? err.message : 'Gagal mengarsipkan surat',
      });
    }
  }

  return ok(res, { approved, skipped }, 'Batch persetujuan arsip diproses', {
    approved: approved.length,
    skipped: skipped.length,
  });
});

// ---------- POST /outgoing-letters/archive-approvals/reject (revisi arsip surat keluar) ----------
router.post('/archive-approvals/reject', requirePermission('archive.reject'), async (req, res) => {
  if (!(await isArchiveApprover(req))) {
    return fail(res, 403, 'Penolakan arsip hanya untuk Sekcam/Camat');
  }
  const schema = z.object({
    ids: z.array(z.string().uuid()).min(1, 'Pilih minimal 1 surat').max(ARCHIVE_BATCH_MAX, `Maksimal ${ARCHIVE_BATCH_MAX} surat per batch`),
    note: z.string().min(3, 'Catatan revisi minimal 3 karakter').max(500),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const rejected: Array<{ id: string; note: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const id of parsed.data.ids) {
    if (seen.has(id)) {
      skipped.push({ id, reason: 'ID duplikat dalam batch' });
      continue;
    }
    seen.add(id);
    const letter = await prisma.outgoingLetter.findUnique({
      where: { id },
      include: { archiveRecord: { select: { id: true } } },
    });
    if (!letter) {
      skipped.push({ id, reason: 'Surat tidak ditemukan' });
      continue;
    }
    if (letter.status !== 'TERKIRIM') {
      skipped.push({ id, reason: `Status bukan TERKIRIM (saat ini ${letter.status})` });
      continue;
    }
    if (letter.archiveRecord) {
      skipped.push({ id, reason: 'Surat sudah memiliki record arsip' });
      continue;
    }
    if (letter.archiveRejectedAt) {
      skipped.push({ id, reason: 'Surat sudah dalam status ditolak, tunggu pengajuan ulang' });
      continue;
    }
    await prisma.outgoingLetter.update({
      where: { id },
      data: {
        archiveRejectedAt: new Date(),
        archiveRejectionNote: parsed.data.note,
      },
    });
    await notifyUser(letter.createdBy, {
      type: 'ARCHIVE_REJECTED',
      title: `Revisi arsip surat keluar: ${letter.subject}`.slice(0, 255),
      body: `Surat ${letter.letterNumber} dikembalikan: ${parsed.data.note}`,
      referenceType: 'outgoing_letter',
      referenceId: letter.id,
    }).catch(() => undefined);
    rejected.push({ id, note: parsed.data.note });
  }

  return ok(res, { rejected, skipped }, 'Surat keluar dikembalikan untuk revisi', {
    rejected: rejected.length,
    skipped: skipped.length,
  });
});

// ---------- POST /outgoing-letters/:id/resubmit-archive (ajukan ulang setelah revisi) ----------
router.post('/:id/resubmit-archive', requirePermission('outgoing.issue'), async (req, res) => {
  const letter = await prisma.outgoingLetter.findUnique({
    where: { id: req.params.id },
    include: { archiveRecord: { select: { id: true } } },
  });
  if (!letter) return fail(res, 404, 'Surat keluar tidak ditemukan');
  if (letter.status !== 'TERKIRIM') return fail(res, 409, `Hanya surat TERKIRIM yang bisa diajukan ulang (saat ini ${letter.status})`);
  if (letter.archiveRecord) return fail(res, 409, 'Surat sudah memiliki record arsip');
  if (!letter.archiveRejectedAt) return fail(res, 409, 'Surat tidak sedang dalam status ditolak');

  const updated = await prisma.outgoingLetter.update({
    where: { id: letter.id },
    data: { archiveRejectedAt: null, archiveRejectionNote: null },
    include: includeDetail,
  });
  await notifyOutgoingArchiveQueue(updated);
  return ok(res, withOutgoingView(updated, req.user!), 'Surat diajukan ulang ke antrean arsip');
});

// ---------- POST /outgoing-letters/:id/expedition (langkah 8: serah ke caraka) ----------
router.post('/:id/expedition', requirePermission('outgoing.issue'), async (req, res) => {
  const schema = z.object({
    sentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    courierName: z.string().max(150).optional(),
    recipientName: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const letter = await prisma.outgoingLetter.findUnique({
    where: { id: req.params.id },
    include: { outgoingExpedition: true },
  });
  if (!letter) return fail(res, 404, 'Surat keluar tidak ditemukan');
  if (letter.status !== 'TERKIRIM') {
    return fail(res, 409, `Hanya surat TERKIRIM yang masuk buku ekspedisi (saat ini ${letter.status})`);
  }
  if (letter.outgoingExpedition?.receivedDate) {
    return fail(res, 409, 'Surat sudah tercatat diterima; data kirim tidak bisa diubah');
  }

  try {
    await prisma.$transaction(async (tx) => {
      await markOutgoingExpeditionSent(tx, {
        letterId: letter.id,
        recipientName: parsed.data.recipientName?.trim() || letter.recipient || 'BKD Kota Makassar',
        sentDate: parsed.data.sentDate,
        courierName: parsed.data.courierName?.trim() || req.user!.username,
        note: parsed.data.note,
        createdBy: req.user!.id,
      });
    });
  } catch (e) {
    if (e instanceof OutgoingExpeditionError) return fail(res, e.status, e.message);
    throw e;
  }

  const updated = await prisma.outgoingLetter.findUniqueOrThrow({ where: { id: letter.id }, include: includeDetail });
  return ok(res, withOutgoingView(updated, req.user!), 'Surat dicatat di buku ekspedisi dan diserahkan ke caraka');
});

// ---------- POST /outgoing-letters/:id/expedition/receipt (langkah 9: bukti terima) ----------
router.post('/:id/expedition/receipt', requirePermission('outgoing.issue'), async (req, res) => {
  const schema = z.object({
    receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    receivedByName: z.string().min(1, 'Nama penerima bukti terima wajib').max(150),
    receiptNumber: z.string().max(100).optional(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());

  const letter = await prisma.outgoingLetter.findUnique({
    where: { id: req.params.id },
    include: { outgoingExpedition: true },
  });
  if (!letter) return fail(res, 404, 'Surat keluar tidak ditemukan');
  if (letter.status !== 'TERKIRIM') {
    return fail(res, 409, `Hanya surat TERKIRIM yang punya bukti terima (saat ini ${letter.status})`);
  }
  if (!letter.outgoingExpedition?.sentAt) {
    return fail(res, 409, 'Catat penyerahan ke caraka di buku ekspedisi terlebih dahulu');
  }
  if (letter.outgoingExpedition?.receivedDate) {
    return fail(res, 409, 'Bukti terima sudah dicatat dan tidak bisa ditimpa');
  }

  try {
    await prisma.$transaction(async (tx) => {
      await markOutgoingExpeditionReceived(tx, {
        letterId: letter.id,
        recipientName: letter.outgoingExpedition?.recipientName || letter.recipient || 'BKD Kota Makassar',
        receivedDate: parsed.data.receivedDate,
        receivedByName: parsed.data.receivedByName,
        receiptNumber: parsed.data.receiptNumber,
        note: parsed.data.note,
        receivedBy: req.user!.id,
        createdBy: req.user!.id,
      });
    });
  } catch (e) {
    if (e instanceof OutgoingExpeditionError) return fail(res, e.status, e.message);
    throw e;
  }

  const updated = await prisma.outgoingLetter.findUniqueOrThrow({ where: { id: letter.id }, include: includeDetail });
  return ok(res, withOutgoingView(updated, req.user!), 'Bukti terima dicatat; surat sudah diterima instansi tujuan');
});

// ---------- GET /outgoing-letters/:id ----------
router.get('/:id', requirePermission('outgoing.view'), async (req, res) => {
  const l = await prisma.outgoingLetter.findUnique({ where: { id: req.params.id }, include: includeDetail });
  if (!l) return fail(res, 404, 'Surat keluar tidak ditemukan');
  return ok(res, withOutgoingView(l, req.user!));
});

export default router;
