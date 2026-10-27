import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authRequired, requirePermission } from '../middleware/auth';
import { ok, fail } from '../utils/response';
import { parseYMD } from '../services/attendance.service';
import {
  ARCHIVE_CATEGORIES,
  ARCHIVE_LIST_STATUS,
  ARCHIVE_SOURCES,
  ArchiveError,
  createArchiveRecord,
  locationForCategory,
  nextArchiveListNumber,
} from '../services/archive.service';

const router = Router();
router.use(authRequired);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format tanggal YYYY-MM-DD');

const sourceSelect = {
  id: true,
  agendaNumber: true,
  letterNumber: true,
  subject: true,
  sender: true,
  letterDate: true,
  status: true,
};

const outgoingSourceSelect = {
  id: true,
  letterNumber: true,
  subject: true,
  recipient: true,
  letterDate: true,
  status: true,
};

const creatorSelect = {
  id: true,
  username: true,
  employee: { select: { name: true, nip: true } },
};

const includeRecord = {
  classification: true,
  incomingLetter: { select: sourceSelect },
  outgoingLetter: { select: outgoingSourceSelect },
  list: { select: { id: true, listNumber: true, status: true, signedAt: true } },
  creator: { select: creatorSelect },
};

const includeRecordInList = {
  classification: true,
  incomingLetter: { select: sourceSelect },
  outgoingLetter: { select: outgoingSourceSelect },
  creator: { select: creatorSelect },
};

const includeList = {
  signer: { select: creatorSelect },
  creator: { select: creatorSelect },
  records: {
    include: includeRecordInList,
    orderBy: [{ archiveDate: 'asc' as const }, { archiveNumber: 'asc' as const }],
  },
};

function getYearRange(year: number) {
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lte: new Date(Date.UTC(year, 11, 31)),
  };
}

function handleError(res: any, err: unknown) {
  if (err instanceof ArchiveError) return fail(res, err.status, err.message);
  throw err;
}

// ---------- GET /archives/stats ----------
router.get('/stats', requirePermission('archive.view'), async (req, res) => {
  const year = Number((req.query as any).year) || new Date().getFullYear();
  const where: any = { archiveDate: getYearRange(year) };
  const [total, byCategory, bySource, unlisted, signedLists] = await Promise.all([
    prisma.archiveRecord.count({ where }),
    prisma.archiveRecord.groupBy({ by: ['category'], where, _count: { _all: true } }),
    prisma.archiveRecord.groupBy({ by: ['sourceType'], where, _count: { _all: true } }),
    prisma.archiveRecord.count({ where: { ...where, listId: null } }),
    prisma.archiveList.count({
      where: { status: 'SIGNED', periodStart: getYearRange(year) },
    }),
  ]);
  return ok(res, {
    year,
    total,
    unlisted,
    signedLists,
    byCategory: Object.fromEntries(byCategory.map((x) => [x.category, x._count._all])),
    bySource: Object.fromEntries(bySource.map((x) => [x.sourceType, x._count._all])),
  });
});

// ---------- GET /archives/candidates ----------
// Surat yang siap dicatat ke buku arsip. Operasi tulis, jadi pakai archive.create.
router.get('/candidates', requirePermission('archive.create'), async (req, res) => {
  const { sourceType = 'INCOMING', q, limit = '20' } = req.query as any;
  if (!ARCHIVE_SOURCES.includes(sourceType)) return fail(res, 422, 'sourceType tidak valid');
  const take = Math.min(50, Math.max(1, Number(limit) || 20));
  const where: any = { archiveRecord: { is: null } };
  if (q) {
    where.OR = sourceType === 'INCOMING'
      ? [
          { subject: { contains: String(q), mode: 'insensitive' } },
          { letterNumber: { contains: String(q), mode: 'insensitive' } },
          { agendaNumber: { contains: String(q), mode: 'insensitive' } },
          { sender: { contains: String(q), mode: 'insensitive' } },
        ]
      : [
          { subject: { contains: String(q), mode: 'insensitive' } },
          { letterNumber: { contains: String(q), mode: 'insensitive' } },
          { recipient: { contains: String(q), mode: 'insensitive' } },
        ];
  }

  if (sourceType === 'INCOMING') {
    where.status = { in: ['COMPLETED', 'ARCHIVED'] };
    const items = await prisma.incomingLetter.findMany({
      where,
      include: { classification: true },
      orderBy: [{ letterDate: 'desc' }, { createdAt: 'desc' }],
      take,
    });
    return ok(res, items.map((l) => ({
      id: l.id,
      sourceType: 'INCOMING',
      agendaNumber: l.agendaNumber,
      letterNumber: l.letterNumber,
      subject: l.subject,
      party: l.sender,
      date: l.letterDate.toISOString().slice(0, 10),
      status: l.status,
      classification: l.classification ? { code: l.classification.code, name: l.classification.name } : null,
    })));
  }

  where.status = 'ISSUED';
  const items = await prisma.outgoingLetter.findMany({
    where,
    include: { classification: true },
    orderBy: [{ letterDate: 'desc' }, { createdAt: 'desc' }],
    take,
  });
  return ok(res, items.map((l) => ({
    id: l.id,
    sourceType: 'OUTGOING',
    agendaNumber: null,
    letterNumber: l.letterNumber,
    subject: l.subject,
    party: l.recipient,
    date: l.letterDate.toISOString().slice(0, 10),
    status: l.status,
    classification: l.classification ? { code: l.classification.code, name: l.classification.name } : null,
  })));
});

// ---------- GET /archives/lists ----------
router.get('/lists', requirePermission('archive.view'), async (req, res) => {
  const { status, year, page = '1', limit = '20' } = req.query as any;
  const where: any = {};
  if (status) {
    if (!ARCHIVE_LIST_STATUS.includes(status)) return fail(res, 422, 'status daftar tidak valid');
    where.status = status;
  }
  if (year) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return fail(res, 422, 'year tidak valid');
    where.periodStart = getYearRange(y);
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 20);
  const [total, items] = await Promise.all([
    prisma.archiveList.count({ where }),
    prisma.archiveList.findMany({
      where,
      include: {
        signer: { select: creatorSelect },
        creator: { select: creatorSelect },
        _count: { select: { records: true } },
      },
      orderBy: [{ periodStart: 'desc' }, { listNumber: 'desc' }],
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- POST /archives/lists ----------
// Langkah 2: menyusun Daftar Arsip. Bila recordIds tidak dikirim, semua record
// belum masuk daftar pada rentang tanggal akan dipakai.
router.post('/lists', requirePermission('archive.update'), async (req, res) => {
  const schema = z.object({
    periodStart: ymd,
    periodEnd: ymd,
    recordIds: z.array(z.string().uuid()).max(1000).refine(
      (ids) => new Set(ids).size === ids.length,
      'recordIds tidak boleh duplikat',
    ).optional(),
    notes: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const start = parseYMD(b.periodStart)!;
  const end = parseYMD(b.periodEnd)!;
  if (start > end) return fail(res, 422, 'periodStart tidak boleh setelah periodEnd');
  if (b.recordIds !== undefined && b.recordIds.length === 0) {
    return fail(res, 422, 'Pilih minimal satu arsip');
  }

  try {
    const list = await prisma.$transaction(async (tx) => {
      let ids = b.recordIds;
      if (!ids) {
        const auto = await tx.archiveRecord.findMany({
          where: { listId: null, archiveDate: { gte: start, lte: end } },
          select: { id: true },
          orderBy: [{ archiveDate: 'asc' }, { archiveNumber: 'asc' }],
          take: 1000,
        });
        if (auto.length === 0) {
          throw new ArchiveError(422, 'Tidak ada arsip belum masuk daftar pada periode ini');
        }
        ids = auto.map((r) => r.id);
      }

      const records = await tx.archiveRecord.findMany({
        where: { id: { in: ids } },
        select: { id: true, archiveDate: true, listId: true },
      });
      if (records.length !== ids.length) throw new ArchiveError(422, 'Ada record arsip yang tidak ditemukan');
      if (records.some((r) => r.listId)) throw new ArchiveError(409, 'Ada arsip yang sudah masuk daftar lain');
      if (records.some((r) => r.archiveDate < start || r.archiveDate > end)) {
        throw new ArchiveError(422, 'Semua arsip harus berada dalam periode daftar');
      }

      const created = await tx.archiveList.create({
        data: {
          listNumber: await nextArchiveListNumber(tx, start.getUTCFullYear()),
          periodStart: start,
          periodEnd: end,
          status: 'DRAFT',
          notes: b.notes?.trim() || null,
          createdBy: req.user!.id,
        },
      });
      const updated = await tx.archiveRecord.updateMany({
        where: { id: { in: ids }, listId: null },
        data: { listId: created.id },
      });
      if (updated.count !== ids.length) {
        throw new ArchiveError(409, 'Sebagian arsip sudah masuk daftar lain');
      }
      return tx.archiveList.findUnique({ where: { id: created.id }, include: includeList });
    });
    return res.status(201).json({ success: true, message: 'Daftar arsip dibuat', data: list, meta: null, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---------- GET /archives/lists/:id ----------
router.get('/lists/:id', requirePermission('archive.view'), async (req, res) => {
  const list = await prisma.archiveList.findUnique({ where: { id: req.params.id }, include: includeList });
  if (!list) return fail(res, 404, 'Daftar arsip tidak ditemukan');
  return ok(res, list);
});

// ---------- PATCH /archives/lists/:id ----------
router.patch('/lists/:id', requirePermission('archive.update'), async (req, res) => {
  const schema = z.object({ notes: z.string().max(1000).nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const list = await prisma.archiveList.findUnique({ where: { id: req.params.id } });
  if (!list) return fail(res, 404, 'Daftar arsip tidak ditemukan');
  if (list.status !== 'DRAFT') return fail(res, 409, 'Daftar yang sudah ditandatangani tidak dapat diubah');
  const updated = await prisma.archiveList.update({
    where: { id: list.id },
    data: { notes: parsed.data.notes?.trim() || null },
    include: includeList,
  });
  return ok(res, updated, 'Daftar arsip diperbarui');
});

// ---------- POST /archives/lists/:id/records ----------
router.post('/lists/:id/records', requirePermission('archive.update'), async (req, res) => {
  const schema = z.object({
    recordIds: z.array(z.string().uuid()).min(1).max(1000).refine(
      (ids) => new Set(ids).size === ids.length,
      'recordIds tidak boleh duplikat',
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const list = await prisma.archiveList.findUnique({ where: { id: req.params.id } });
  if (!list) return fail(res, 404, 'Daftar arsip tidak ditemukan');
  if (list.status !== 'DRAFT') return fail(res, 409, 'Daftar yang sudah ditandatangani tidak dapat diubah');

  const ids = parsed.data.recordIds;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const records = await tx.archiveRecord.findMany({
        where: { id: { in: ids } },
        select: { id: true, archiveDate: true, listId: true },
      });
      if (records.length !== ids.length) throw new ArchiveError(422, 'Ada record arsip yang tidak ditemukan');
      if (records.some((r) => r.listId)) throw new ArchiveError(409, 'Ada arsip yang sudah masuk daftar lain');
      if (records.some((r) => r.archiveDate < list.periodStart || r.archiveDate > list.periodEnd)) {
        throw new ArchiveError(422, 'Semua arsip harus berada dalam periode daftar');
      }
      const resUpdate = await tx.archiveRecord.updateMany({
        where: { id: { in: ids }, listId: null },
        data: { listId: list.id },
      });
      if (resUpdate.count !== ids.length) throw new ArchiveError(409, 'Sebagian arsip sudah masuk daftar lain');
      return tx.archiveList.findUnique({ where: { id: list.id }, include: includeList });
    });
    return ok(res, updated, 'Arsip ditambahkan ke daftar');
  } catch (err) {
    return handleError(res, err);
  }
});

// ---------- DELETE /archives/lists/:id/records/:recordId ----------
router.delete('/lists/:id/records/:recordId', requirePermission('archive.update'), async (req, res) => {
  const list = await prisma.archiveList.findUnique({ where: { id: req.params.id } });
  if (!list) return fail(res, 404, 'Daftar arsip tidak ditemukan');
  if (list.status !== 'DRAFT') return fail(res, 409, 'Daftar yang sudah ditandatangani tidak dapat diubah');
  const record = await prisma.archiveRecord.findUnique({ where: { id: req.params.recordId } });
  if (!record || record.listId !== list.id) return fail(res, 404, 'Arsip tidak ada di daftar ini');
  await prisma.archiveRecord.update({ where: { id: record.id }, data: { listId: null } });
  const updated = await prisma.archiveList.findUnique({ where: { id: list.id }, include: includeList });
  return ok(res, updated, 'Arsip dikeluarkan dari daftar');
});

// ---------- POST /archives/lists/:id/sign ----------
// Langkah 2 SOP: daftar ditandatangani Sekcam atau Camat.
router.post('/lists/:id/sign', requirePermission('archive.sign'), async (req, res) => {
  const list = await prisma.archiveList.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { records: true } } },
  });
  if (!list) return fail(res, 404, 'Daftar arsip tidak ditemukan');
  if (list.status !== 'DRAFT') return fail(res, 409, 'Daftar sudah ditandatangani');
  if (list._count.records === 0) return fail(res, 409, 'Daftar arsip masih kosong');

  const isSuper = req.user!.permissions.includes('*');
  if (!isSuper && !['SEKCAM', 'CAMAT'].includes(req.user!.position ?? '')) {
    return fail(res, 403, 'Daftar arsip hanya dapat ditandatangani Sekcam atau Camat');
  }
  const signer = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { employee: true },
  });
  if (!signer) return fail(res, 404, 'Penandatangan tidak ditemukan');

  // Guard atomik: dua penandatangan bersamaan tidak boleh saling menimpa.
  const signed = await prisma.archiveList.updateMany({
    where: { id: list.id, status: 'DRAFT' },
    data: {
      status: 'SIGNED',
      signedAt: new Date(),
      signerUserId: signer.id,
      signerName: signer.employee?.name ?? signer.username,
      signerNip: signer.employee?.nip ?? null,
      signerPosition: signer.position ?? signer.employee?.position ?? null,
    },
  });
  if (signed.count === 0) return fail(res, 409, 'Daftar sudah ditandatangani');
  const updated = await prisma.archiveList.findUniqueOrThrow({
    where: { id: list.id },
    include: includeList,
  });
  if (list.createdBy !== signer.id) {
    // Notifikasi bersifat best-effort: jangan gagalkan tanda tangan yang sudah tersimpan.
    await prisma.notification.create({
      data: {
        userId: list.createdBy,
        type: 'ARCHIVE',
        title: `Daftar arsip ${list.listNumber} ditandatangani`,
        body: `Daftar arsip periode ${list.periodStart.toISOString().slice(0, 10)} s.d. ${list.periodEnd.toISOString().slice(0, 10)} telah ditandatangani ${updated.signerName ?? signer.username}.`,
        referenceType: 'archive_list',
        referenceId: list.id,
      },
    }).catch(() => undefined);
  }
  return ok(res, updated, 'Daftar arsip ditandatangani');
});

// ---------- GET /archives ----------
router.get('/', requirePermission('archive.view'), async (req, res) => {
  const { sourceType, category, q, listId, unlisted, year, dateFrom, dateTo, page = '1', limit = '20' } = req.query as any;
  const where: any = {};
  if (sourceType) {
    if (!ARCHIVE_SOURCES.includes(sourceType)) return fail(res, 422, 'sourceType tidak valid');
    where.sourceType = sourceType;
  }
  if (category) {
    if (!ARCHIVE_CATEGORIES.includes(category)) return fail(res, 422, 'kategori tidak valid');
    where.category = category;
  }
  if (listId) where.listId = String(listId);
  if (unlisted === 'true') where.listId = null;
  if (dateFrom || dateTo) {
    const range: any = {};
    if (dateFrom) {
      const d = parseYMD(String(dateFrom));
      if (!d) return fail(res, 422, 'dateFrom tidak valid');
      range.gte = d;
    }
    if (dateTo) {
      const d = parseYMD(String(dateTo));
      if (!d) return fail(res, 422, 'dateTo tidak valid');
      range.lte = d;
    }
    where.archiveDate = range;
  } else if (year) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return fail(res, 422, 'year tidak valid');
    where.archiveDate = getYearRange(y);
  }
  if (q) {
    where.OR = [
      { archiveNumber: { contains: String(q), mode: 'insensitive' } },
      { title: { contains: String(q), mode: 'insensitive' } },
      { documentNumber: { contains: String(q), mode: 'insensitive' } },
      { code: { contains: String(q), mode: 'insensitive' } },
      { bundleCode: { contains: String(q), mode: 'insensitive' } },
      { notes: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 20);
  const [total, items] = await Promise.all([
    prisma.archiveRecord.count({ where }),
    prisma.archiveRecord.findMany({
      where,
      include: includeRecord,
      orderBy: [{ archiveDate: 'desc' }, { archiveNumber: 'desc' }],
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- POST /archives ----------
router.post('/', requirePermission('archive.create'), async (req, res) => {
  const schema = z.object({
    sourceType: z.enum(ARCHIVE_SOURCES),
    sourceId: z.string().uuid(),
    classificationCode: z.string().max(30).optional(),
    code: z.string().max(100).optional(),
    bundleCode: z.string().max(100).optional(),
    category: z.enum(ARCHIVE_CATEGORIES).optional(),
    archiveDate: ymd.optional(),
    retentionUntil: ymd.optional(),
    notes: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  try {
    const record = await createArchiveRecord({ ...parsed.data, actorId: req.user!.id });
    const full = await prisma.archiveRecord.findUnique({ where: { id: record.id }, include: includeRecord });
    return res.status(201).json({ success: true, message: 'Dokumen dicatat ke buku arsip', data: full, meta: null, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---------- GET /archives/:id ----------
router.get('/:id', requirePermission('archive.view'), async (req, res) => {
  const record = await prisma.archiveRecord.findUnique({ where: { id: req.params.id }, include: includeRecord });
  if (!record) return fail(res, 404, 'Record arsip tidak ditemukan');
  return ok(res, record);
});

// ---------- PATCH /archives/:id ----------
router.patch('/:id', requirePermission('archive.update'), async (req, res) => {
  const schema = z.object({
    classificationCode: z.string().max(30).nullable().optional(),
    code: z.string().max(100).nullable().optional(),
    bundleCode: z.string().max(100).nullable().optional(),
    category: z.enum(ARCHIVE_CATEGORIES).optional(),
    archiveDate: ymd.optional(),
    retentionUntil: ymd.nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const record = await prisma.archiveRecord.findUnique({
    where: { id: req.params.id },
    include: { list: true },
  });
  if (!record) return fail(res, 404, 'Record arsip tidak ditemukan');
  if (record.list?.status === 'SIGNED') {
    return fail(res, 409, 'Arsip dalam daftar yang sudah ditandatangani tidak dapat diubah');
  }

  const data: any = {};
  if (b.classificationCode !== undefined) {
    if (!b.classificationCode) {
      data.classificationId = null;
    } else {
      const cls = await prisma.archiveClassification.findUnique({ where: { code: b.classificationCode } });
      if (!cls || !cls.isActive) return fail(res, 422, 'Kode klasifikasi tidak dikenal/aktif');
      data.classificationId = cls.id;
    }
  }
  if (b.code !== undefined) {
    if (!b.code?.trim()) return fail(res, 422, 'Kode arsip wajib diisi');
    data.code = b.code.trim();
  }
  if (b.bundleCode !== undefined) data.bundleCode = b.bundleCode?.trim() || null;
  if (b.category !== undefined) {
    data.category = b.category;
    data.location = locationForCategory(b.category);
  }
  if (b.archiveDate !== undefined) {
    const date = parseYMD(b.archiveDate);
    if (!date) return fail(res, 422, 'archiveDate tidak valid');
    data.archiveDate = date;
  }
  if (b.retentionUntil !== undefined) {
    if (!b.retentionUntil) data.retentionUntil = null;
    else {
      const date = parseYMD(b.retentionUntil);
      if (!date) return fail(res, 422, 'retentionUntil tidak valid');
      data.retentionUntil = date;
    }
  }
  if (b.notes !== undefined) data.notes = b.notes?.trim() || null;

  const finalArchiveDate = data.archiveDate ?? record.archiveDate;
  const finalRetention = b.retentionUntil !== undefined ? data.retentionUntil : record.retentionUntil;
  if (finalRetention && finalRetention < finalArchiveDate) {
    return fail(res, 422, 'retensi tidak boleh sebelum tanggal arsip');
  }
  if (record.list && data.archiveDate) {
    if (data.archiveDate < record.list.periodStart || data.archiveDate > record.list.periodEnd) {
      return fail(res, 422, 'Tanggal arsip harus berada dalam periode daftar');
    }
  }

  const updated = await prisma.archiveRecord.update({
    where: { id: record.id },
    data,
    include: includeRecord,
  });
  return ok(res, updated, 'Record arsip diperbarui');
});

export default router;
