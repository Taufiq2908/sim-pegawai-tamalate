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
import { ARCHIVE_CATEGORIES, ArchiveError, createArchiveRecord } from '../services/archive.service';
import { can } from '../lib/permissions';

const router = Router();
router.use(authRequired);

const LETTER_STATUS = ['RECEIVED', 'PARAF', 'DISPOSED', 'COMPLETED', 'ARCHIVED'] as const;
const PRIORITY = ['BIASA', 'SEGERA', 'SANGAT_SEGERA'] as const;

// 9 tujuan disposisi tetap berupa label organisasi. Untuk notifikasi, label
// dipetakan ke jabatan yang sudah ada (5 role sistem, tanpa role baru).
const TARGET_POSITION: Record<string, string> = {
  SEKCAM: 'SEKCAM',
  KASI_PEM: 'KASI',
  KASI_TRANTIB: 'KASI',
  KASI_PMK: 'KASI',
  KASI_EKBANG: 'KASI',
  KASI_BERSIH: 'KASI',
  KASUBAG_UMUM: 'KASUBAG',
  KASUBAG_RENKEU: 'KASUBAG',
  BENDAHARA: 'BENDAHARA',
};
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
  dispositions: {
    include: { fromUser: { omit: { passwordHash: true } }, toUser: { omit: { passwordHash: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  agendaAssignments: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          position: true,
          employee: { select: { name: true, nip: true, position: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  archiveRecord: {
    include: { list: { select: { id: true, listNumber: true, status: true } } },
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

function publicDocument(d: any, letterId: string) {
  const rest = { ...d };
  delete rest.storedPath;
  return {
    ...rest,
    downloadUrl: `/api/v1/letters/${letterId}/documents/${d.id}/download`,
  };
}

function toDetail(l: any, perms: string[], meId: string) {
  return {
    ...l,
    documents: (l.documents ?? []).map((d: any) => publicDocument(d, l.id)),
    availableActions: availableActions(l.status, perms),
    assignedStaff: (l.agendaAssignments ?? []).map((a: any) => ({
      id: a.user.id,
      username: a.user.username,
      name: a.user.employee?.name ?? a.user.username,
      nip: a.user.employee?.nip ?? null,
      position: a.user.position ?? a.user.employee?.position ?? null,
      note: a.note,
    })),
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
      { agendaAssignments: { some: { userId: meId } } },
    ],
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** multipart mengirim array sebagai JSON string atau "id1,id2". */
function parseUserIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // bukan JSON; coba pisahkan koma
    }
    const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
    return ids.length ? ids : undefined;
  }
  return undefined;
}

function tomorrowYMD(): string {
  return todayYMD(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

// Agenda pimpinan memperlihatkan semua kegiatan; role lain tetap mengikuti scope surat.
function agendaScopeWhere(meId: string, role: string): any {
  if (role === 'SUPER_ADMIN' || role === 'VERIFIER' || role === 'LEADER') return {};
  return scopeWhere(meId, role);
}

async function validateAgendaUsers(ids: string[] | undefined): Promise<string[]> {
  if (!ids?.length) return [];
  const unique = [...new Set(ids)];
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true },
  });
  if (users.length !== unique.length) throw new Error('Ada petugas agenda yang tidak ditemukan/aktif');
  return unique;
}

function toAgendaRow(l: any) {
  return {
    ...l,
    assignedStaff: (l.agendaAssignments ?? []).map((a: any) => ({
      id: a.user.id,
      username: a.user.username,
      name: a.user.employee?.name ?? a.user.username,
      nip: a.user.employee?.nip ?? null,
      position: a.user.position ?? a.user.employee?.position ?? null,
      note: a.note,
    })),
  };
}

async function loadAgenda(start: Date, end: Date, user: any) {
  const where: any = {
    activityDate: { gte: start, lte: end },
    ...agendaScopeWhere(user.id, user.role),
  };
  const items = await prisma.incomingLetter.findMany({
    where,
    include: {
      classification: true,
      creator: { omit: { passwordHash: true } },
      agendaAssignments: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              position: true,
              employee: { select: { name: true, nip: true, position: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: [{ activityDate: 'asc' }, { activityStartTime: 'asc' }, { createdAt: 'asc' }],
    take: 500,
  });
  return items.map(toAgendaRow);
}

// ---------- POST /letters (JSON atau multipart + file opsional) ----------
router.post('/', requirePermission('letter.create'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const uploaded = (req as any).file;
    const cleanupUpload = () => {
      if (uploaded) fs.rmSync(uploaded.path, { force: true });
    };
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
      activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      activityStartTime: z.string().regex(TIME_RE).optional(),
      activityEndTime: z.string().regex(TIME_RE).optional(),
      activityLocation: z.string().max(200).optional(),
      assignedUserIds: z.preprocess(
        parseUserIds,
        z.array(z.string().uuid()).max(50).optional(),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      cleanupUpload();
      return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
    }
    const b = parsed.data;
    const letterDate = parseYMD(b.letterDate);
    if (!letterDate) {
      cleanupUpload();
      return fail(res, 422, 'letterDate tidak valid');
    }
    if (b.activityDate && !parseYMD(b.activityDate)) {
      cleanupUpload();
      return fail(res, 422, 'activityDate tidak valid');
    }
    if (b.activityStartTime && b.activityEndTime && b.activityEndTime < b.activityStartTime) {
      cleanupUpload();
      return fail(res, 422, 'Waktu selesai tidak boleh sebelum waktu mulai');
    }

    const assignedIds = await validateAgendaUsers(b.assignedUserIds).catch(() => null);
    if (assignedIds === null) {
      cleanupUpload();
      return fail(res, 422, 'Ada petugas agenda yang tidak ditemukan/aktif');
    }

    let classificationId: string | null = null;
    if (b.classificationCode) {
      const cls = await prisma.archiveClassification.findUnique({ where: { code: b.classificationCode } });
      if (!cls || !cls.isActive) {
        cleanupUpload();
        return fail(res, 422, 'Kode klasifikasi tidak dikenal');
      }
      classificationId = cls.id;
    }

    const year = new Date().getFullYear();
    const count = await prisma.incomingLetter.count({
      where: { agendaNumber: { startsWith: `AGENDA-${year}-` } },
    });
    const agendaNumber = `AGENDA-${year}-${String(count + 1).padStart(4, '0')}`;
    const letter = await prisma.incomingLetter.create({
      data: {
        agendaNumber,
        letterNumber: b.letterNumber,
        sender: b.sender,
        subject: b.subject,
        letterDate,
        receivedDate: parseYMD(todayYMD())!,
        priority: b.priority,
        secrecy: b.secrecy,
        summary: b.summary,
        addressedTo: b.addressedTo,
        pic: b.pic,
        remarks: b.remarks,
        activityDate: b.activityDate ? parseYMD(b.activityDate) : null,
        activityStartTime: b.activityStartTime ?? null,
        activityEndTime: b.activityEndTime ?? null,
        activityLocation: b.activityLocation?.trim() || null,
        classificationId,
        status: 'RECEIVED',
        createdBy: req.user!.id,
        ...(assignedIds.length
          ? { agendaAssignments: { create: assignedIds.map((userId) => ({ userId })) } }
          : {}),
      },
    });

    const f = uploaded;
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
      { addressedTo: { contains: String(q), mode: 'insensitive' } },
      { pic: { contains: String(q), mode: 'insensitive' } },
      { remarks: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.incomingLetter.count({ where }),
    prisma.incomingLetter.findMany({
      where,
      include: {
        creator: { omit: { passwordHash: true } },
        dispositions: { include: { fromUser: { omit: { passwordHash: true } }, toUser: { omit: { passwordHash: true } } } },
        agendaAssignments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                position: true,
                employee: { select: { name: true, nip: true, position: true } },
              },
            },
          },
        },
        _count: { select: { documents: true } },
        archiveRecord: { select: { id: true, archiveNumber: true, listId: true } },
      },
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
  const [items, users] = await Promise.all([
    prisma.dispositionTarget.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        position: true,
        employee: { select: { name: true, nip: true } },
      },
    }),
  ]);
  // mappedPosition + recipients membantu frontend menampilkan tujuan organisasi
  // tanpa memperkenalkan role baru; penerima aktual tetap dihitung backend.
  return ok(res, items.map((t) => {
    const positions = new Set([t.code, TARGET_POSITION[t.code] ?? t.code]);
    const recipients = users
      .filter((u) => u.position && positions.has(u.position))
      .map((u) => ({
        id: u.id,
        username: u.username,
        name: u.employee?.name ?? u.username,
        nip: u.employee?.nip ?? null,
      }));
    return {
      ...t,
      mappedPosition: TARGET_POSITION[t.code] ?? t.code,
      recipients,
      available: recipients.length > 0,
    };
  }));
});

// ---------- GET /letters/register-book (buku agenda surat masuk) ----------
// Kolom: nomor, instansiDitujukan, noSurat, tanggalSurat, perihal, penanggungJawab, ket
router.get('/register-book', requirePermission('letter.view'), async (req, res) => {
  if (req.user!.role === 'EMPLOYEE') {
    return fail(res, 403, 'Buku agenda surat hanya untuk petugas');
  }
  const { from, to, q, status } = req.query as any;
  const where: any = {};
  if (from || to) {
    where.receivedDate = {};
    if (from) {
      const d = parseYMD(String(from));
      if (!d) return fail(res, 422, 'from tidak valid');
      where.receivedDate.gte = d;
    }
    if (to) {
      const d = parseYMD(String(to));
      if (!d) return fail(res, 422, 'to tidak valid');
      where.receivedDate.lte = d;
    }
  }
  if (status) {
    if (!LETTER_STATUS.includes(status)) return fail(res, 422, 'status tidak valid');
    where.status = status;
  }
  if (q) {
    where.OR = [
      { subject: { contains: String(q), mode: 'insensitive' } },
      { letterNumber: { contains: String(q), mode: 'insensitive' } },
      { sender: { contains: String(q), mode: 'insensitive' } },
      { addressedTo: { contains: String(q), mode: 'insensitive' } },
      { pic: { contains: String(q), mode: 'insensitive' } },
      { remarks: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const items = await prisma.incomingLetter.findMany({
    where,
    include: {
      creator: { omit: { passwordHash: true } },
      classification: true,
      agendaAssignments: {
        include: { user: { select: { id: true, username: true } } },
      },
    },
    orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
    take: 2000,
  });
  const rows = items.map((l, i) => ({
    nomor: i + 1,
    nomorAgenda: l.agendaNumber,
    instansiDitujukan: l.addressedTo ?? '-',
    instansiAsal: l.sender,
    noSurat: l.letterNumber,
    nomorSurat: l.letterNumber,
    tanggalSurat: l.letterDate.toISOString().slice(0, 10),
    tanggalDiterima: l.receivedDate.toISOString().slice(0, 10),
    perihal: l.subject,
    penanggungJawab: l.pic ?? l.creator.username,
    klasifikasi: l.classification?.code ?? '-',
    ket: l.remarks ?? l.status,
    keterangan: l.remarks ?? l.status,
    status: l.status,
    petugasAgenda: l.agendaAssignments.map((a) => a.user.username),
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

// ---------- GET /letters/:id/disposition-sheet (lembar disposisi) ----------
router.get('/:id/disposition-sheet', requirePermission('letter.view'), async (req, res) => {
  const l = await prisma.incomingLetter.findUnique({
    where: { id: req.params.id },
    include: {
      classification: true,
      dispositions: {
        include: {
          fromUser: { omit: { passwordHash: true } },
          toUser: { omit: { passwordHash: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      agendaAssignments: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              employee: { select: { name: true, nip: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'VERIFIER') {
    const involved =
      l.createdBy === req.user!.id ||
      l.dispositions.some((d) => d.fromUserId === req.user!.id || d.toUserId === req.user!.id) ||
      l.agendaAssignments.some((a) => a.userId === req.user!.id);
    if (!involved) return fail(res, 403, 'Surat ini bukan untukmu');
  }
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
    tanggalKegiatan: l.activityDate ? l.activityDate.toISOString().slice(0, 10) : null,
    waktuMulai: l.activityStartTime,
    waktuSelesai: l.activityEndTime,
    tempatKegiatan: l.activityLocation,
    petugasAgenda: l.agendaAssignments.map((a) => ({
      id: a.user.id,
      username: a.user.username,
      nama: a.user.employee?.name ?? a.user.username,
      nip: a.user.employee?.nip ?? null,
    })),
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
  if (req.user!.role === 'EMPLOYEE') {
    return fail(res, 403, 'Buku ekspedisi hanya untuk petugas');
  }
  const { from, to, q, letterId } = req.query as any;
  const where: any = {};
  if (letterId) where.letterId = String(letterId);
  if (from || to) {
    where.receiptDate = {};
    if (from) {
      const d = parseYMD(String(from));
      if (!d) return fail(res, 422, 'from tidak valid');
      where.receiptDate.gte = d;
    }
    if (to) {
      const d = parseYMD(String(to));
      if (!d) return fail(res, 422, 'to tidak valid');
      where.receiptDate.lte = d;
    }
  }
  if (q) {
    where.letter = {
      is: {
        OR: [
          { sender: { contains: String(q), mode: 'insensitive' } },
          { subject: { contains: String(q), mode: 'insensitive' } },
          { letterNumber: { contains: String(q), mode: 'insensitive' } },
        ],
      },
    };
  }
  const items = await prisma.expeditionReceipt.findMany({
    where,
    include: { letter: true },
    orderBy: [{ receiptDate: 'asc' }, { createdAt: 'asc' }],
    take: 2000,
  });
  const rows = items.map((e) => ({
    id: e.id,
    letterId: e.letter.id,
    tanggalHariIni: e.receiptDate.toISOString().slice(0, 10),
    nomorRegis: e.regNumber,
    nomorSurat: e.letter.letterNumber,
    tanggalSurat: e.letter.letterDate.toISOString().slice(0, 10),
    perihal: e.letter.subject,
    penerimaSurat: e.receiverName,
    paraf: e.signatureName ?? '-',
    asalSurat: e.letter.sender,
    catatan: e.note,
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

// ---------- GET /letters/agenda (kalender/agenda pimpinan) ----------
router.get('/agenda', requirePermission('letter.view'), async (req, res) => {
  const { date, from, to } = req.query as any;
  let start: Date | null = null;
  let end: Date | null = null;
  if (date) {
    const d = parseYMD(String(date));
    if (!d) return fail(res, 422, 'date tidak valid');
    start = d;
    end = d;
  } else if (from || to) {
    if (from) {
      const d = parseYMD(String(from));
      if (!d) return fail(res, 422, 'from tidak valid');
      start = d;
    }
    if (to) {
      const d = parseYMD(String(to));
      if (!d) return fail(res, 422, 'to tidak valid');
      end = d;
    }
    if (!start) start = end;
    if (!end) end = start;
    if (start && end && start > end) return fail(res, 422, 'from tidak boleh setelah to');
  } else {
    const d = parseYMD(todayYMD());
    start = d;
    end = d;
  }
  if (!start || !end) return fail(res, 422, 'Rentang agenda tidak valid');
  const rows = await loadAgenda(start, end, req.user!);
  return ok(res, rows, 'ok', {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    total: rows.length,
  });
});

// ---------- GET /letters/agenda/tomorrow (agenda esok hari) ----------
router.get('/agenda/tomorrow', requirePermission('letter.view'), async (req, res) => {
  const d = parseYMD(tomorrowYMD());
  if (!d) return fail(res, 422, 'Tanggal agenda tidak valid');
  const rows = await loadAgenda(d, d, req.user!);
  return ok(res, rows, 'ok', {
    from: tomorrowYMD(),
    to: tomorrowYMD(),
    total: rows.length,
  });
});

// ---------- PATCH /letters/:id/agenda (ubah kegiatan & petugas) ----------
router.patch('/:id/agenda', requirePermission('letter.register'), async (req, res) => {
  const schema = z.object({
    activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    activityStartTime: z.string().regex(TIME_RE).nullable().optional(),
    activityEndTime: z.string().regex(TIME_RE).nullable().optional(),
    activityLocation: z.string().max(200).nullable().optional(),
    assignedUserIds: z.preprocess(
      parseUserIds,
      z.array(z.string().uuid()).max(50).optional(),
    ),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status === 'ARCHIVED') return fail(res, 409, 'Surat sudah diarsipkan');

  const assignedIds = b.assignedUserIds === undefined
    ? undefined
    : await validateAgendaUsers(b.assignedUserIds).catch(() => null);
  if (assignedIds === null) return fail(res, 422, 'Ada petugas agenda yang tidak ditemukan/aktif');
  if (b.activityDate && !parseYMD(b.activityDate)) {
    return fail(res, 422, 'activityDate tidak valid');
  }

  const data: any = {};
  if (b.activityDate !== undefined) data.activityDate = b.activityDate ? parseYMD(b.activityDate) : null;
  if (b.activityStartTime !== undefined) data.activityStartTime = b.activityStartTime || null;
  if (b.activityEndTime !== undefined) data.activityEndTime = b.activityEndTime || null;
  if (b.activityLocation !== undefined) data.activityLocation = b.activityLocation?.trim() || null;

  const finalStart = data.activityStartTime !== undefined ? data.activityStartTime : l.activityStartTime;
  const finalEnd = data.activityEndTime !== undefined ? data.activityEndTime : l.activityEndTime;
  if (finalStart && finalEnd && finalEnd < finalStart) {
    return fail(res, 422, 'Waktu selesai tidak boleh sebelum waktu mulai');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.incomingLetter.update({ where: { id: l.id }, data });
    if (assignedIds !== undefined) {
      await tx.agendaAssignment.deleteMany({ where: { letterId: l.id } });
      if (assignedIds.length) {
        await tx.agendaAssignment.createMany({
          data: assignedIds.map((userId) => ({ letterId: l.id, userId })),
        });
      }
    }
    return tx.incomingLetter.findUniqueOrThrow({ where: { id: l.id }, include: includeDetail });
  });
  return ok(res, toDetail(updated, req.user!.permissions, req.user!.id), 'Agenda surat diperbarui');
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
      l.dispositions.some((d: any) => d.fromUserId === req.user!.id || d.toUserId === req.user!.id) ||
      l.agendaAssignments.some((a: any) => a.userId === req.user!.id);
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
    return res.status(201).json({ success: true, message: 'Dokumen ditambahkan', data: publicDocument(doc, l.id), meta: null, errors: null });
  });
});

// ---------- GET /letters/:id/documents/:docId/download ----------
router.get('/:id/documents/:docId/download', requirePermission('letter.view'), async (req, res) => {
  const l = await prisma.incomingLetter.findUnique({
    where: { id: req.params.id },
    include: {
      documents: { where: { id: req.params.docId } },
      dispositions: { select: { fromUserId: true, toUserId: true } },
      agendaAssignments: { select: { userId: true } },
    },
  });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'VERIFIER') {
    const involved =
      l.createdBy === req.user!.id ||
      l.dispositions.some((d) => d.fromUserId === req.user!.id || d.toUserId === req.user!.id) ||
      l.agendaAssignments.some((a) => a.userId === req.user!.id);
    if (!involved) return fail(res, 403, 'Surat ini bukan untukmu');
  }
  const doc = l.documents[0];
  if (!doc || !fs.existsSync(doc.storedPath)) return fail(res, 404, 'Dokumen tidak ditemukan');
  return res.download(doc.storedPath, doc.originalName);
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
        title: `Disposisi baru: ${l.subject}`.slice(0, 255),
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

// ---------- POST /letters/:id/dispositions (disposisi massal / centang 9 tujuan) ----------
router.post('/:id/dispositions', requirePermission('letter.dispose'), async (req, res) => {
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const schema = z.object({
    instruction: z.string().min(5, 'Isi disposisi minimal 5 karakter'),
    deadline: z.string().regex(ymd).optional(),
    // Format utama: satu baris per tujuan. targetCode boleh tanpa toUserId
    // (backend memetakan ke jabatan), atau toUserId eksplisit.
    targets: z.array(z.object({
      targetCode: z.string().max(30).optional(),
      toUserId: z.string().uuid().optional(),
      instruction: z.string().min(5).optional(),
      deadline: z.string().regex(ymd).optional(),
    })).min(1).max(30).optional(),
    // Shorthand untuk UI centang 9 tujuan.
    targetCodes: z.array(z.string().max(30)).min(1).max(9).optional(),
    // Penerima spesifik tanpa targetCode (mis. tambahan atasan/staf).
    toUserIds: z.array(z.string().uuid()).min(1).max(50).optional(),
  }).refine(
    (d) => Boolean(d.targets?.length || d.targetCodes?.length || d.toUserIds?.length),
    { message: 'targets, targetCodes, atau toUserIds wajib diisi' },
  );
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (!['RECEIVED', 'PARAF', 'DISPOSED'].includes(l.status)) {
    return fail(res, 409, `Disposisi hanya saat RECEIVED/PARAF/DISPOSED (saat ini ${l.status})`);
  }

  type RawTarget = {
    targetCode?: string;
    toUserId?: string;
    instruction?: string;
    deadline?: string;
  };
  const rawTargets: RawTarget[] = [
    ...(b.targets ?? []),
    ...(b.targetCodes ?? []).map((targetCode): RawTarget => ({ targetCode })),
    ...(b.toUserIds ?? []).map((toUserId): RawTarget => ({ toUserId })),
  ];

  const codes = [...new Set(rawTargets.map((t) => t.targetCode).filter(Boolean) as string[])];
  const targetRows = codes.length
    ? await prisma.dispositionTarget.findMany({
      where: { code: { in: codes }, isActive: true },
    })
    : [];
  const targetMap = new Map(targetRows.map((t) => [t.code, t]));
  const unknownCodes = codes.filter((code) => !targetMap.has(code));
  if (unknownCodes.length) {
    return fail(res, 422, `targetCode tidak dikenal: ${unknownCodes.join(', ')}`);
  }

  type Recipient = {
    userId: string;
    targetCode: string | null;
    targetName: string | null;
    instruction: string;
    deadline: Date | null;
  };
  const recipients: Recipient[] = [];
  const seen = new Set<string>();

  for (const t of rawTargets) {
    const target = t.targetCode ? targetMap.get(t.targetCode) : null;
    let userIds: string[] = [];

    if (t.toUserId) {
      const user = await prisma.user.findUnique({ where: { id: t.toUserId } });
      if (!user || !user.isActive) return fail(res, 422, `Penerima ${t.toUserId} tidak valid/aktif`);
      userIds = [user.id];
    } else if (t.targetCode) {
      // Dukung data lama (jabatan KASI) maupun data yang lebih spesifik
      // (mis. KASI_PEM). Tidak membuat role baru.
      const mapped = TARGET_POSITION[t.targetCode];
      const positions = [...new Set([t.targetCode, mapped].filter(Boolean) as string[])];
      const users = await prisma.user.findMany({
        where: { isActive: true, position: { in: positions } },
        select: { id: true },
      });
      if (!users.length) {
        return fail(res, 422, `Tidak ada pengguna aktif untuk tujuan ${t.targetCode}`);
      }
      userIds = users.map((u) => u.id);
    } else {
      return fail(res, 422, 'Setiap target wajib memiliki targetCode atau toUserId');
    }

    const deadlineStr = t.deadline ?? b.deadline;
    if (deadlineStr && !parseYMD(deadlineStr)) {
      return fail(res, 422, `deadline tidak valid untuk tujuan ${t.targetCode ?? 'penerima'}`);
    }

    for (const userId of userIds) {
      if (userId === req.user!.id) continue;
      const key = `${userId}:${t.targetCode ?? ''}:${t.instruction ?? b.instruction}:${deadlineStr ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({
        userId,
        targetCode: t.targetCode ?? null,
        targetName: target?.name ?? null,
        instruction: t.instruction ?? b.instruction,
        deadline: deadlineStr ? parseYMD(deadlineStr) : null,
      });
    }
  }

  if (!recipients.length) {
    return fail(res, 422, 'Tidak ada penerima disposisi (tidak boleh hanya diri sendiri)');
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const r of recipients) {
      const d = await tx.letterDisposition.create({
        data: {
          letterId: l.id,
          fromUserId: req.user!.id,
          toUserId: r.userId,
          instruction: r.instruction,
          deadline: r.deadline,
          targetCode: r.targetCode,
          targetName: r.targetName,
          status: 'PENDING',
        },
      });
      await tx.notification.create({
        data: {
          userId: r.userId,
          type: 'DISPOSITION',
          title: `Disposisi baru: ${l.subject}`.slice(0, 255),
          body: `${req.user!.username} mendisposisikan "${l.subject}" kepada Anda${r.targetName ? ` (${r.targetName})` : ''}: ${r.instruction}`,
          referenceType: 'letter_disposition',
          referenceId: d.id,
        },
      });
      rows.push(d);
    }
    if (l.status === 'RECEIVED' || l.status === 'PARAF') {
      await tx.incomingLetter.update({
        where: { id: l.id },
        data: { status: 'DISPOSED', distributedAt: l.distributedAt ?? new Date() },
      });
    }
    return rows;
  });

  const full = await prisma.incomingLetter.findUnique({ where: { id: l.id }, include: includeDetail });
  return res.status(201).json({
    success: true,
    message: `Disposisi dikirim ke ${created.length} penerima`,
    data: {
      dispositions: created,
      letter: toDetail(full, req.user!.permissions, req.user!.id),
    },
    meta: null,
    errors: null,
  });
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
// Mengarsipkan surat sekaligus mencatatnya ke buku arsip (SOP langkah 1).
router.post('/:id/archive', requirePermission('letter.archive'), async (req, res) => {
  const l = await prisma.incomingLetter.findUnique({ where: { id: req.params.id }, include: { archiveRecord: true } });
  if (!l) return fail(res, 404, 'Surat tidak ditemukan');
  if (l.status !== 'COMPLETED') return fail(res, 409, `Arsip hanya dari COMPLETED (saat ini ${l.status})`);
  if (l.archiveRecord) return fail(res, 409, 'Surat sudah memiliki record arsip');

  const body = z.object({
    classificationCode: z.string().max(30).optional(),
    code: z.string().max(100).optional(),
    bundleCode: z.string().max(100).optional(),
    category: z.enum(ARCHIVE_CATEGORIES).optional(),
    archiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    retentionUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(1000).optional(),
  }).safeParse(req.body ?? {});
  if (!body.success) return fail(res, 422, 'Validasi gagal', body.error.flatten());

  try {
    await createArchiveRecord({
      sourceType: 'INCOMING',
      sourceId: l.id,
      actorId: req.user!.id,
      ...body.data,
    });
  } catch (err) {
    if (err instanceof ArchiveError) return fail(res, err.status, err.message);
    throw err;
  }
  const updated = await prisma.incomingLetter.findUnique({ where: { id: l.id }, include: includeDetail });
  return ok(
    res,
    toDetail(updated!, req.user!.permissions, req.user!.id),
    'Surat diarsipkan dan dicatat ke buku arsip',
  );
});

export default router;
