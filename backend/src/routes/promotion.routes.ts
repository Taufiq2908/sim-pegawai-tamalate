import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { ok, fail } from '../utils/response';
import { can, usersForPermission } from '../lib/permissions';
import { parseYMD, todayYMD } from '../services/attendance.service';
import { formatLetterNumber, letterUnitCode } from '../services/numbering.service';
import {
  NumberingError,
  allocateOutgoingSequence,
  claimOutgoingBuffer,
} from '../services/outgoing-numbering.service';
import {
  ARCHIVE_CATEGORIES,
  locationForCategory,
  nextArchiveNumber,
} from '../services/archive.service';
import {
  PROMOTION_ACTION_LABELS,
  PROMOTION_DOC_TYPES,
  PROMOTION_ITEM_STATUS_LABELS,
  PROMOTION_MIN_YEARS,
  PROMOTION_OTHER_DOC,
  PROMOTION_REQUIRED_DOCS,
  PROMOTION_STATUS_LABELS,
  TRANSITIONS,
  addYears,
  availableActions,
  computeYearsBetween,
  defaultEffectiveDate,
  isHigherRank,
  missingPromotionDocs,
  nextRank,
  normalizeRank,
  promotionDocChecklist,
  promotionPeriodLabel,
  ymd,
} from '../services/promotion.service';

const router = Router();
router.use(authRequired);

const KECAMATAN_CODE = 'KEC-TAMALATE';
const DEFAULT_PROMOTION_CLASSIFICATION = '800.1.3.2'; // Kenaikan pangkat/golongan

fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  dest: env.uploadDir,
  limits: { fileSize: env.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const actorInclude = {
  omit: { passwordHash: true as const },
  include: { employee: { select: { name: true, nip: true } } },
};

const outgoingMini = {
  select: {
    id: true,
    letterNumber: true,
    subject: true,
    letterDate: true,
    status: true,
    recipient: true,
    destinationNumber: true,
    personInCharge: true,
    letterCode: true,
    classification: { select: { code: true, name: true } },
    archiveRecord: {
      select: { id: true, archiveNumber: true, archiveDate: true, category: true, location: true },
    },
  },
};

function includeDetail(scopeEmployeeId?: string | null) {
  return {
    creator: actorInclude,
    outgoingLetter: outgoingMini,
    items: {
      include: {
        employee: { include: { orgUnit: true } },
        documents: { orderBy: { createdAt: 'asc' as const } },
      },
      ...(scopeEmployeeId ? { where: { employeeId: scopeEmployeeId } } : {}),
      orderBy: { employeeName: 'asc' as const },
    },
    approvals: {
      include: { actor: actorInclude },
      orderBy: { createdAt: 'asc' as const },
    },
  };
}

const listInclude = {
  creator: actorInclude,
  outgoingLetter: outgoingMini,
  items: {
    select: {
      id: true,
      employeeName: true,
      employeeNip: true,
      currentRank: true,
      targetRank: true,
      effectiveDate: true,
      status: true,
    },
    orderBy: { employeeName: 'asc' as const },
    take: 30,
  },
  _count: { select: { items: true } },
};

function publicDocument(d: any, batchId: string, itemId: string) {
  const rest = { ...d };
  delete rest.storedPath;
  return {
    ...rest,
    downloadUrl: `/api/v1/promotion-requests/${batchId}/items/${itemId}/documents/${d.id}/download`,
  };
}

function dateOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return ymd(new Date(value));
}

function employeeScope(req: any): string | null {
  return req.user?.role === 'EMPLOYEE' ? (req.user.employeeId ?? null) : null;
}

function employeeOnlyBooks(req: any): boolean {
  return req.user?.role === 'EMPLOYEE';
}

function listIncludeFor(scopeEmployeeId?: string | null) {
  return {
    ...listInclude,
    items: {
      ...listInclude.items,
      ...(scopeEmployeeId ? { where: { employeeId: scopeEmployeeId } } : {}),
    },
  };
}

function canAccessBatch(req: any, batch: any): boolean {
  const scope = employeeScope(req);
  if (!scope) return true;
  return (batch.items ?? []).some((item: any) => item.employeeId === scope);
}

function filterActionsForUser(actions: string[], user: any, status: string): string[] {
  return actions.filter((action) => {
    if (action === 'paraf') return user.role === 'SUPER_ADMIN' || user.position === 'SEKCAM';
    if (action === 'approve') return user.role === 'SUPER_ADMIN' || user.position === 'CAMAT';
    if (action === 'revise' || action === 'reject') {
      if (status === 'LEGALIZED') return user.role === 'SUPER_ADMIN' || user.position === 'KASUBAG';
      if (status === 'VERIFIED') return user.role === 'SUPER_ADMIN' || user.position === 'SEKCAM';
      if (status === 'PARAF') return user.role === 'SUPER_ADMIN' || user.position === 'CAMAT';
    }
    return true;
  });
}

async function signers() {
  const [camat, sekcam] = await Promise.all([
    prisma.user.findFirst({
      where: { position: 'CAMAT', isActive: true },
      include: { employee: { select: { name: true, nip: true } } },
    }),
    prisma.user.findFirst({
      where: { position: 'SEKCAM', isActive: true },
      include: { employee: { select: { name: true, nip: true } } },
    }),
  ]);
  return {
    camat: camat
      ? { name: camat.employee?.name ?? camat.username, nip: camat.employee?.nip ?? null, position: 'CAMAT' }
      : null,
    sekcam: sekcam
      ? { name: sekcam.employee?.name ?? sekcam.username, nip: sekcam.employee?.nip ?? null, position: 'SEKCAM' }
      : null,
  };
}

async function toDetail(r: any, user: any, scopeEmployeeId?: string | null) {
  const items = (r.items ?? []).map((item: any) => {
    const docs = item.documents ?? [];
    return {
      ...item,
      statusLabel: PROMOTION_ITEM_STATUS_LABELS[item.status] ?? item.status,
      documents: docs.map((d: any) => publicDocument(d, r.id, item.id)),
      documentsChecklist: promotionDocChecklist(docs),
      missingDocuments: missingPromotionDocs(docs),
    };
  });
  const available = filterActionsForUser(availableActions(r.status, user.permissions), user, r.status);
  const s = await signers();
  return {
    ...r,
    items,
    statusLabel: PROMOTION_STATUS_LABELS[r.status] ?? r.status,
    availableActions: available,
    canEdit: ['DRAFT', 'REVISION'].includes(r.status),
    signers: s,
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
    ...(scopeEmployeeId ? { scopeEmployeeId } : {}),
  };
}

async function getBatchForAction(req: any, id: string) {
  return prisma.promotionBatch.findUnique({
    where: { id },
    include: {
      items: { include: { employee: true } },
      outgoingLetter: outgoingMini,
    },
  });
}

interface ItemInput {
  employeeId: string;
  targetRank?: string;
  currentRankTmt?: string;
  effectiveDate?: string;
  note?: string;
}

function buildItemData(
  employee: any,
  input: ItemInput,
  periodYear: number,
  periodMonth: number | null,
): { data?: any; error?: string; rankTmt?: Date } {
  const currentRank = normalizeRank(employee.rank);
  if (!currentRank) return { error: `${employee.name}: golongan saat ini belum diisi` };

  const targetRank = normalizeRank(input.targetRank) || nextRank(currentRank);
  if (!targetRank) {
    return { error: `${employee.name}: tidak ada golongan berikutnya setelah ${currentRank}; isi targetRank manual` };
  }
  const higher = isHigherRank(targetRank, currentRank);
  if (higher === null) {
    return { error: `${employee.name}: golongan ${currentRank} -> ${targetRank} tidak dikenali` };
  }
  if (!higher) {
    return { error: `${employee.name}: golongan tujuan ${targetRank} harus lebih tinggi dari ${currentRank}` };
  }

  const rankTmt = input.currentRankTmt
    ? parseYMD(input.currentRankTmt)
    : (employee.rankTmt ? new Date(employee.rankTmt) : null);
  if (!rankTmt) {
    return { error: `${employee.name}: TMT pangkat terakhir belum diisi; kirim currentRankTmt` };
  }

  const effectiveDate = input.effectiveDate
    ? parseYMD(input.effectiveDate)
    : defaultEffectiveDate(periodYear, periodMonth);
  if (!effectiveDate) return { error: `${employee.name}: effectiveDate tidak valid` };
  if (effectiveDate <= rankTmt) {
    return { error: `${employee.name}: TMT kenaikan pangkat harus setelah TMT pangkat terakhir` };
  }

  return {
    rankTmt,
    data: {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeNip: employee.nip,
      employeeNumber: employee.employeeNumber,
      currentRank,
      currentRankTmt: rankTmt,
      targetRank,
      effectiveDate,
      yearsInCurrentRank: computeYearsBetween(rankTmt, effectiveDate),
      position: employee.position,
      orgUnitName: employee.orgUnit?.name ?? null,
      status: 'PENDING',
      note: input.note,
    },
  };
}

function actionSchema(action: string) {
  const note = z.string().max(2000).optional();
  const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  switch (action) {
    case 'legalize':
      return z.object({
        note,
        stampNumber: z.string().max(100).optional(),
        legalizedAt: ymdSchema.optional(),
      });
    case 'verify':
      return z.object({
        note,
        documentsComplete: z.boolean().optional().default(false),
      });
    case 'revise':
    case 'reject':
      return z.object({ note: z.string().min(5, 'Catatan minimal 5 karakter').max(2000) });
    case 'register':
      return z.object({
        outgoingLetterId: z.string().uuid().optional(),
        outgoingLetterNumber: z.string().min(1).max(150).optional(),
        outgoingLetterDate: ymdSchema.optional(),
        agendaNumber: z.string().min(1).max(50).optional(),
        createOutgoingLetter: z.boolean().optional(),
        classificationCode: z.string().max(30).optional(),
        letterCode: z.string().max(30).optional(),
        subject: z.string().min(5).max(500).optional(),
        recipient: z.string().max(200).optional(),
        signerName: z.string().max(150).optional(),
        personInCharge: z.string().max(150).optional(),
        sentAt: ymdSchema.optional(),
        note,
      });
    case 'archive':
      return z.object({
        archiveDate: ymdSchema.optional(),
        category: z.enum(ARCHIVE_CATEGORIES).optional(),
        code: z.string().max(100).optional(),
        bundleCode: z.string().max(100).optional(),
        retentionUntil: ymdSchema.optional(),
        notes: z.string().max(1000).optional(),
        note,
      });
    default:
      return z.object({ note });
  }
}

// ---------------- Notifikasi alur ----------------
const NEXT_PERMISSION: Record<string, string | null> = {
  legalize: 'promotion.verify',
  verify: 'promotion.paraf',
  revise: 'promotion.legalize',
  paraf: 'promotion.approve',
  approve: 'promotion.register',
  register: 'promotion.archive',
  archive: null,
  reject: null,
};

async function promotionUsersForPermission(code: string): Promise<string[]> {
  const ids = await usersForPermission(code);
  if (code === 'promotion.paraf') {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, position: 'SEKCAM', isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (code === 'promotion.approve') {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, position: 'CAMAT', isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  return ids;
}

async function notifyPromotionTransition(opts: {
  batchId: string;
  batchNumber: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  actorName: string;
  actorPosition: string | null;
  note?: string | null;
}) {
  try {
    const ids = new Set<string>();
    const next = NEXT_PERMISSION[opts.action];
    if (next) {
      for (const id of await promotionUsersForPermission(next)) ids.add(id);
    }
    const items = await prisma.promotionItem.findMany({
      where: { batchId: opts.batchId },
      select: { employeeId: true },
    });
    const employeeIds = [...new Set(items.map((i) => i.employeeId))];
    if (employeeIds.length) {
      const users = await prisma.user.findMany({
        where: { employeeId: { in: employeeIds }, isActive: true },
        select: { id: true },
      });
      for (const u of users) ids.add(u.id);
    }
    ids.delete(opts.actorId);
    if (!ids.size) return;
    const label = PROMOTION_ACTION_LABELS[opts.action] ?? opts.action;
    await prisma.notification.createMany({
      data: [...ids].map((userId) => ({
        userId,
        type: 'PANGKAT',
        title: `Usulan Kenaikan Pangkat ${opts.batchNumber} ${label}`,
        body: `${opts.actorName}${opts.actorPosition ? ` (${opts.actorPosition})` : ''}: ${opts.fromStatus} -> ${opts.toStatus}${opts.note ? ` - ${opts.note}` : ''}`,
        referenceType: 'promotion_batch',
        referenceId: opts.batchId,
      })),
    });
  } catch (e) {
    console.error('notify kenaikan pangkat gagal:', (e as Error).message);
  }
}

// ---------------- Daftar calon kenaikan pangkat ----------------
// GET /promotion-requests/candidates?periodYear=2026&asOf=2026-11-01&minYears=4
// Default hanya menampilkan ASN yang sudah memenuhi masa jabatan. Gunakan
// includeAll=true untuk menampilkan pegawai yang belum jatuh tempo / belum punya
// TMT pangkat terakhir (berguna untuk melengkapi data).
router.get('/candidates', requirePermission('promotion.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Daftar calon kenaikan pangkat hanya untuk petugas kepegawaian');
  const { q, orgUnit, employmentStatus = 'PNS', includeAll, asOf, minYears } = req.query as any;
  const now = new Date();
  const asOfDate = asOf ? parseYMD(String(asOf)) : new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  ));
  if (!asOfDate) return fail(res, 422, 'asOf tidak valid (YYYY-MM-DD)');
  const min = minYears !== undefined ? Number(minYears) : PROMOTION_MIN_YEARS;
  if (!Number.isInteger(min) || min < 0 || min > 15) return fail(res, 422, 'minYears harus 0-15');

  const where: any = { isActive: true };
  if (employmentStatus && employmentStatus !== 'ALL') where.employmentStatus = String(employmentStatus);
  if (orgUnit) where.orgUnit = { code: String(orgUnit) };
  if (q) {
    where.OR = [
      { name: { contains: String(q), mode: 'insensitive' } },
      { nip: { contains: String(q), mode: 'insensitive' } },
      { employeeNumber: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  const employees = await prisma.employee.findMany({
    where,
    include: { orgUnit: true },
    orderBy: { name: 'asc' },
  });

  const ids = employees.map((e) => e.id);
  const existingItems = ids.length
    ? await prisma.promotionItem.findMany({
        where: {
          employeeId: { in: ids },
          batch: { status: { notIn: ['REJECTED', 'ARCHIVED'] } },
        },
        include: { batch: { select: { id: true, batchNumber: true, status: true, periodYear: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const existingByEmployee = new Map<string, any>();
  for (const item of existingItems) {
    if (!existingByEmployee.has(item.employeeId)) existingByEmployee.set(item.employeeId, item);
  }

  const rows: any[] = [];
  let missingRankTmt = 0;
  let notDue = 0;
  const showAll = includeAll === 'true' || includeAll === '1';
  for (const e of employees) {
    const currentRank = normalizeRank(e.rank);
    const dueDate = e.rankTmt ? addYears(e.rankTmt, min) : null;
    const yearsInRank = e.rankTmt ? computeYearsBetween(e.rankTmt, asOfDate) : null;
    const eligible = dueDate ? dueDate <= asOfDate : null;
    if (!e.rankTmt) {
      missingRankTmt += 1;
      if (!showAll) continue;
    } else if (!eligible) {
      notDue += 1;
      if (!showAll) continue;
    }
    const existing = existingByEmployee.get(e.id) ?? null;
    rows.push({
      employee: {
        id: e.id,
        nip: e.nip,
        employeeNumber: e.employeeNumber,
        name: e.name,
        gender: e.gender,
        rank: currentRank,
        rankTmt: dateOrNull(e.rankTmt),
        position: e.position,
        employmentStatus: e.employmentStatus,
        orgUnit: e.orgUnit ? { id: e.orgUnit.id, code: e.orgUnit.code, name: e.orgUnit.name } : null,
      },
      currentRank,
      currentRankTmt: dateOrNull(e.rankTmt),
      suggestedTargetRank: nextRank(currentRank),
      yearsInRank,
      minYears: min,
      dueDate: dateOrNull(dueDate),
      eligible,
      missingRankTmt: !e.rankTmt,
      existingItem: existing
        ? {
            id: existing.id,
            batchId: existing.batchId,
            batchNumber: existing.batch.batchNumber,
            batchStatus: existing.batch.status,
            periodYear: existing.batch.periodYear,
            itemStatus: existing.status,
          }
        : null,
    });
  }
  rows.sort((a, b) => {
    if (a.missingRankTmt !== b.missingRankTmt) return a.missingRankTmt ? 1 : -1;
    return String(a.dueDate ?? '9999-12-31').localeCompare(String(b.dueDate ?? '9999-12-31'));
  });
  return ok(res, rows, 'ok', {
    total: rows.length,
    asOf: ymd(asOfDate),
    minYears: min,
    employmentStatus: employmentStatus || 'PNS',
    missingRankTmt,
    notDue,
    alreadyInBatch: rows.filter((r) => r.existingItem).length,
  });
});

// ---------------- Checklist dokumen ----------------
router.get('/required-docs', requirePermission('promotion.view'), async (_req, res) => {
  return ok(res, {
    required: PROMOTION_REQUIRED_DOCS,
    otherDocType: PROMOTION_OTHER_DOC,
    acceptedTypes: PROMOTION_DOC_TYPES,
    note: 'Checklist ini tampil di langkah verifikasi. Petugas tetap mengonfirmasi kelengkapan sebelum status VERIFIED.',
  });
});

// ---------------- Buku register / nominatif / arsip ----------------
router.get('/register', requirePermission('promotion.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Buku register hanya untuk petugas kepegawaian');
  const { year, status, q } = req.query as any;
  const y = year ? Number(year) : null;
  if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return fail(res, 422, 'year tidak valid');
  const where: any = {};
  if (y !== null) where.periodYear = y;
  if (status) where.status = String(status);
  if (q) {
    where.OR = [
      { batchNumber: { contains: String(q), mode: 'insensitive' } },
      { outgoingLetterNumber: { contains: String(q), mode: 'insensitive' } },
      { outgoingLetter: { letterNumber: { contains: String(q), mode: 'insensitive' } } },
      { items: { some: { OR: [
        { employeeName: { contains: String(q), mode: 'insensitive' } },
        { employeeNip: { contains: String(q), mode: 'insensitive' } },
      ] } } },
    ];
  }
  const batches = await prisma.promotionBatch.findMany({
    where,
    include: {
      outgoingLetter: outgoingMini,
      items: {
        select: {
          id: true,
          employeeName: true,
          employeeNip: true,
          currentRank: true,
          targetRank: true,
          effectiveDate: true,
          status: true,
        },
        orderBy: { employeeName: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const rows = batches.map((b: any) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    periodYear: b.periodYear,
    periodMonth: b.periodMonth,
    periodLabel: promotionPeriodLabel(b.periodYear, b.periodMonth),
    status: b.status,
    statusLabel: PROMOTION_STATUS_LABELS[b.status] ?? b.status,
    jumlahPegawai: b.items.length,
    pegawai: b.items.map((i: any) => ({
      name: i.employeeName,
      nip: i.employeeNip,
      currentRank: i.currentRank,
      targetRank: i.targetRank,
      effectiveDate: dateOrNull(i.effectiveDate),
      status: i.status,
    })),
    nomorSurat: b.outgoingLetterNumber ?? b.outgoingLetter?.letterNumber ?? null,
    tanggalSurat: dateOrNull(b.outgoingLetterDate ?? b.outgoingLetter?.letterDate),
    nomorAgenda: b.agendaNumber,
    nomorArsip: b.outgoingLetter?.archiveRecord?.archiveNumber ?? null,
    tanggalArsip: dateOrNull(b.outgoingLetter?.archiveRecord?.archiveDate),
    registeredAt: b.registeredAt,
    sentAt: b.sentAt,
    archivedAt: b.archivedAt,
    createdAt: dateOrNull(b.createdAt),
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

router.get('/nominative', requirePermission('promotion.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Daftar nominatif hanya untuk petugas kepegawaian');
  const { year, month, status, q } = req.query as any;
  const y = year ? Number(year) : null;
  const m = month ? Number(month) : null;
  if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return fail(res, 422, 'year tidak valid');
  if (m !== null && (!Number.isInteger(m) || m < 1 || m > 12)) return fail(res, 422, 'month tidak valid');

  const batchFilter: any = {};
  if (y !== null) batchFilter.periodYear = y;
  if (m !== null) batchFilter.periodMonth = m;
  if (status) batchFilter.status = String(status);
  const where: any = {};
  if (Object.keys(batchFilter).length) where.batch = batchFilter;
  if (q) {
    where.OR = [
      { employeeName: { contains: String(q), mode: 'insensitive' } },
      { employeeNip: { contains: String(q), mode: 'insensitive' } },
      { batch: { batchNumber: { contains: String(q), mode: 'insensitive' } } },
    ];
  }
  const items = await prisma.promotionItem.findMany({
    where,
    include: {
      batch: { include: { outgoingLetter: outgoingMini } },
      documents: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: [{ batch: { periodYear: 'desc' } }, { employeeName: 'asc' }],
  });
  const rows = items.map((item: any, index: number) => ({
    nomor: index + 1,
    itemId: item.id,
    batchId: item.batchId,
    batchNumber: item.batch.batchNumber,
    periodYear: item.batch.periodYear,
    periodMonth: item.batch.periodMonth,
    periodLabel: promotionPeriodLabel(item.batch.periodYear, item.batch.periodMonth),
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    employeeNip: item.employeeNip,
    employeeNumber: item.employeeNumber,
    currentRank: item.currentRank,
    currentRankTmt: dateOrNull(item.currentRankTmt),
    targetRank: item.targetRank,
    effectiveDate: dateOrNull(item.effectiveDate),
    yearsInCurrentRank: item.yearsInCurrentRank,
    position: item.position,
    orgUnitName: item.orgUnitName,
    itemStatus: item.status,
    itemStatusLabel: PROMOTION_ITEM_STATUS_LABELS[item.status] ?? item.status,
    batchStatus: item.batch.status,
    statusLabel: PROMOTION_STATUS_LABELS[item.batch.status] ?? item.batch.status,
    documentsChecklist: promotionDocChecklist(item.documents ?? []),
    missingDocuments: missingPromotionDocs(item.documents ?? []),
    nomorSurat: item.batch.outgoingLetterNumber ?? item.batch.outgoingLetter?.letterNumber ?? null,
    nomorAgenda: item.batch.agendaNumber,
    nomorArsip: item.batch.outgoingLetter?.archiveRecord?.archiveNumber ?? null,
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

router.get('/archive-book', requirePermission('promotion.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Buku arsip hanya untuk petugas kepegawaian');
  const { year, q } = req.query as any;
  const y = year ? Number(year) : null;
  if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return fail(res, 422, 'year tidak valid');
  const where: any = { archivedAt: { not: null } };
  if (y !== null) where.periodYear = y;
  if (q) {
    where.OR = [
      { batchNumber: { contains: String(q), mode: 'insensitive' } },
      { outgoingLetter: { letterNumber: { contains: String(q), mode: 'insensitive' } } },
      { items: { some: { OR: [
        { employeeName: { contains: String(q), mode: 'insensitive' } },
        { employeeNip: { contains: String(q), mode: 'insensitive' } },
      ] } } },
    ];
  }
  const batches = await prisma.promotionBatch.findMany({
    where,
    include: {
      outgoingLetter: outgoingMini,
      items: {
        select: { employeeName: true, employeeNip: true, currentRank: true, targetRank: true },
        orderBy: { employeeName: 'asc' },
      },
    },
    orderBy: { archivedAt: 'desc' },
  });
  const rows = batches.map((b: any) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    periodLabel: promotionPeriodLabel(b.periodYear, b.periodMonth),
    tanggalArsip: dateOrNull(b.archivedAt),
    nomorArsip: b.outgoingLetter?.archiveRecord?.archiveNumber ?? null,
    kategori: b.outgoingLetter?.archiveRecord?.category ?? null,
    lokasi: b.outgoingLetter?.archiveRecord?.location ?? null,
    nomorSurat: b.outgoingLetterNumber ?? b.outgoingLetter?.letterNumber ?? null,
    tujuan: b.outgoingLetter?.recipient ?? 'BKPSDMD Kota Makassar',
    jumlahPegawai: b.items.length,
    pegawai: b.items,
    status: b.status,
    statusLabel: PROMOTION_STATUS_LABELS[b.status] ?? b.status,
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

// ---------------- CRUD / daftar usulan ----------------
// GET /promotion-requests
router.get('/', requirePermission('promotion.view'), async (req, res) => {
  const { status, year, q, page = '1', limit = '10' } = req.query as any;
  const where: any = {};
  if (status) where.status = String(status);
  if (year) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return fail(res, 422, 'year tidak valid');
    where.periodYear = y;
  }
  const scope = employeeScope(req);
  if (scope) where.items = { some: { employeeId: scope } };
  if (q) {
    where.OR = [
      { batchNumber: { contains: String(q), mode: 'insensitive' } },
      { outgoingLetterNumber: { contains: String(q), mode: 'insensitive' } },
      { outgoingLetter: { letterNumber: { contains: String(q), mode: 'insensitive' } } },
      { items: { some: { OR: [
        { employeeName: { contains: String(q), mode: 'insensitive' } },
        { employeeNip: { contains: String(q), mode: 'insensitive' } },
      ] } } },
    ];
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.promotionBatch.count({ where }),
    prisma.promotionBatch.findMany({
      where,
      include: listIncludeFor(scope),
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// POST /promotion-requests (langkah 1-2: buat draf daftar usulan)
router.post('/', requirePermission('promotion.create'), async (req, res) => {
  const schema = z.object({
    periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
    periodMonth: z.coerce.number().int().min(1).max(12).optional(),
    note: z.string().max(2000).optional(),
    items: z.array(z.object({
      employeeId: z.string().uuid(),
      targetRank: z.string().max(20).optional(),
      currentRankTmt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      note: z.string().max(1000).optional(),
    })).optional(),
    employeeIds: z.array(z.string().uuid()).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const requested: ItemInput[] = b.items?.length
    ? b.items
    : (b.employeeIds ?? []).map((employeeId) => ({ employeeId }));
  if (!requested.length) return fail(res, 422, 'Minimal satu ASN harus dipilih dari daftar calon');
  const ids = requested.map((x) => x.employeeId);
  if (new Set(ids).size !== ids.length) return fail(res, 422, 'Ada ASN yang dipilih lebih dari sekali');

  const employees = await prisma.employee.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { orgUnit: true },
  });
  const found = new Map(employees.map((e) => [e.id, e]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) return fail(res, 422, `Pegawai tidak ditemukan/tidak aktif: ${missing.join(', ')}`);

  const periodYear = b.periodYear ?? new Date().getUTCFullYear();
  const periodMonth = b.periodMonth ?? null;
  const built = requested.map((x) => buildItemData(found.get(x.employeeId)!, x, periodYear, periodMonth));
  const errors = built.map((x) => x.error).filter(Boolean);
  if (errors.length) return fail(res, 422, errors.join('; '));

  const prefix = `PANGKAT-${periodYear}-`;
  const sequence = await prisma.promotionBatch.count({ where: { batchNumber: { startsWith: prefix } } }) + 1;
  const batchNumber = `${prefix}${String(sequence).padStart(4, '0')}`;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.promotionBatch.create({
        data: {
          batchNumber,
          periodYear,
          periodMonth,
          status: 'DRAFT',
          currentHolderRole: 'VERIFIER',
          note: b.note,
          createdBy: req.user!.id,
          items: { create: built.map((x) => x.data!) },
        },
        include: includeDetail(),
      });
      // Simpan TMT pangkat terakhir yang dikoreksi petugas ke master pegawai.
      for (const [index, input] of requested.entries()) {
        if (input.currentRankTmt) {
          const rankTmt = built[index].rankTmt;
          if (rankTmt) {
            await tx.employee.update({ where: { id: input.employeeId }, data: { rankTmt } });
          }
        }
      }
      await tx.promotionApproval.create({
        data: {
          batchId: batch.id,
          actorUserId: req.user!.id,
          actorRole: req.user!.role,
          actorPosition: req.user!.position,
          fromStatus: '-',
          toStatus: 'DRAFT',
          action: 'CREATE',
          note: `Draf daftar usulan kenaikan pangkat ${promotionPeriodLabel(periodYear, periodMonth)}`,
        },
      });
      return batch;
    });
    return res.status(201).json({
      success: true,
      message: 'Draf daftar usulan kenaikan pangkat dibuat',
      data: await toDetail(created, req.user!),
      meta: null,
      errors: null,
    });
  } catch (e: any) {
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor usulan bentrok, ulangi');
    throw e;
  }
});

// PATCH /promotion-requests/:id (DRAFT/REVISION)
router.patch('/:id', requirePermission('promotion.create'), async (req, res) => {
  const batch = await prisma.promotionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Hanya DRAFT/REVISION yang bisa diubah (saat ini ${batch.status})`);
  }
  const schema = z.object({
    note: z.string().max(2000).optional(),
    periodMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const updated = await prisma.promotionBatch.update({
    where: { id: batch.id },
    data: parsed.data,
    include: includeDetail(),
  });
  return ok(res, await toDetail(updated, req.user!));
});

// POST /promotion-requests/:id/items (tambah ASN ke draf/revisi)
router.post('/:id/items', requirePermission('promotion.create'), async (req, res) => {
  const batch = await prisma.promotionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Item hanya bisa ditambah saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  const schema = z.object({
    employeeIds: z.array(z.string().uuid()).optional(),
    items: z.array(z.object({
      employeeId: z.string().uuid(),
      targetRank: z.string().max(20).optional(),
      currentRankTmt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      note: z.string().max(1000).optional(),
    })).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const requested: ItemInput[] = b.items?.length
    ? b.items
    : (b.employeeIds ?? []).map((employeeId) => ({ employeeId }));
  if (!requested.length) return fail(res, 422, 'Minimal satu ASN harus dipilih');

  const existing = await prisma.promotionItem.findMany({
    where: { batchId: batch.id },
    select: { employeeId: true },
  });
  const existingIds = new Set(existing.map((i) => i.employeeId));
  const fresh = requested.filter((x) => !existingIds.has(x.employeeId));
  if (!fresh.length) return fail(res, 409, 'Semua ASN yang dipilih sudah ada di usulan ini');

  const ids = fresh.map((x) => x.employeeId);
  const employees = await prisma.employee.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { orgUnit: true },
  });
  const found = new Map(employees.map((e) => [e.id, e]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) return fail(res, 422, `Pegawai tidak ditemukan/tidak aktif: ${missing.join(', ')}`);

  const built = fresh.map((x) => buildItemData(found.get(x.employeeId)!, x, batch.periodYear, batch.periodMonth));
  const errors = built.map((x) => x.error).filter(Boolean);
  if (errors.length) return fail(res, 422, errors.join('; '));

  const itemData = built.map((x) => ({ ...x.data!, batchId: batch.id }));
  await prisma.$transaction(async (tx) => {
    await tx.promotionItem.createMany({ data: itemData, skipDuplicates: true });
    for (const [index, input] of fresh.entries()) {
      if (input.currentRankTmt) {
        const rankTmt = built[index].rankTmt;
        if (rankTmt) {
          await tx.employee.update({ where: { id: input.employeeId }, data: { rankTmt } });
        }
      }
    }
    await tx.promotionApproval.create({
      data: {
        batchId: batch.id,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        actorPosition: req.user!.position,
        fromStatus: batch.status,
        toStatus: batch.status,
        action: 'ADD_ITEM',
        note: `Menambahkan ${itemData.length} ASN ke daftar usulan`,
      },
    });
  });
  const full = await prisma.promotionBatch.findUnique({ where: { id: batch.id }, include: includeDetail() });
  return ok(res, await toDetail(full, req.user!));
});

// PATCH /promotion-requests/:id/items/:itemId (DRAFT/REVISION)
router.patch('/:id/items/:itemId', requirePermission('promotion.create'), async (req, res) => {
  const batch = await prisma.promotionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Item hanya bisa diubah saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  const schema = z.object({
    targetRank: z.string().max(20).optional(),
    currentRankTmt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(1000).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const item = await prisma.promotionItem.findFirst({
    where: { id: req.params.itemId, batchId: batch.id },
    include: { employee: { include: { orgUnit: true } } },
  });
  if (!item) return fail(res, 404, 'Item usulan tidak ditemukan');

  const built = buildItemData(item.employee, {
    employeeId: item.employeeId,
    targetRank: b.targetRank ?? item.targetRank,
    currentRankTmt: b.currentRankTmt ?? (item.currentRankTmt ? ymd(item.currentRankTmt) : undefined),
    effectiveDate: b.effectiveDate ?? ymd(item.effectiveDate),
    note: b.note === null ? undefined : (b.note ?? item.note ?? undefined),
  }, batch.periodYear, batch.periodMonth);
  if (built.error) return fail(res, 422, built.error);

  const { employeeId: _employeeId, status: _status, ...data } = built.data;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.promotionItem.update({
      where: { id: item.id },
      data: { ...data, note: b.note === null ? null : (b.note ?? item.note) },
    });
    if (b.currentRankTmt && built.rankTmt) {
      await tx.employee.update({ where: { id: item.employeeId }, data: { rankTmt: built.rankTmt } });
    }
    await tx.promotionApproval.create({
      data: {
        batchId: batch.id,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        actorPosition: req.user!.position,
        fromStatus: batch.status,
        toStatus: batch.status,
        action: 'EDIT_ITEM',
        note: `Mengubah item ${item.employeeName}`,
      },
    });
    return tx.promotionBatch.findUnique({ where: { id: batch.id }, include: includeDetail() });
  });
  return ok(res, await toDetail(updated, req.user!));
});

// DELETE /promotion-requests/:id/items/:itemId
router.delete('/:id/items/:itemId', requirePermission('promotion.create'), async (req, res) => {
  const batch = await prisma.promotionBatch.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Item hanya bisa dihapus saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  if (batch.items.length <= 1) return fail(res, 422, 'Usulan harus memiliki minimal satu ASN');
  const item = batch.items.find((i) => i.id === req.params.itemId);
  if (!item) return fail(res, 404, 'Item usulan tidak ditemukan');
  const docs = await prisma.promotionDocument.findMany({ where: { itemId: item.id } });
  await prisma.promotionItem.delete({ where: { id: item.id } });
  for (const d of docs) {
    try { fs.rmSync(d.storedPath, { force: true }); } catch { /* best-effort */ }
  }
  const full = await prisma.promotionBatch.findUnique({ where: { id: batch.id }, include: includeDetail() });
  return ok(res, await toDetail(full, req.user!), 'ASN dihapus dari daftar usulan');
});

// ---------------- Dokumen ----------------
// POST /promotion-requests/:id/items/:itemId/documents
router.post('/:id/items/:itemId/documents', requirePermission('promotion.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    const file = (req as any).file;
    const cleanupNew = () => { if (file?.path) fs.rmSync(file.path, { force: true }); };
    if (err) {
      cleanupNew();
      return fail(res, 400, err.message);
    }
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    try {
      const batch = await prisma.promotionBatch.findUnique({ where: { id: req.params.id } });
      if (!batch) { cleanupNew(); return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan'); }
      if (!['DRAFT', 'REVISION'].includes(batch.status)) {
        cleanupNew();
        return fail(res, 409, `Upload dokumen hanya saat DRAFT/REVISION (saat ini ${batch.status})`);
      }
      const item = await prisma.promotionItem.findFirst({
        where: { id: req.params.itemId, batchId: batch.id },
      });
      if (!item) { cleanupNew(); return fail(res, 404, 'Item usulan tidak ditemukan'); }
      const docType = String((req.body ?? {}).docType ?? '');
      if (!PROMOTION_DOC_TYPES.includes(docType as any)) {
        cleanupNew();
        return fail(res, 422, `docType tidak dikenal. Gunakan: ${PROMOTION_DOC_TYPES.join(', ')}`);
      }
      const ext = path.extname(file.originalname);
      const storedPath = file.path + ext;
      fs.renameSync(file.path, storedPath);
      const oldDocs = await prisma.promotionDocument.findMany({ where: { itemId: item.id, docType } });
      let doc;
      try {
        doc = await prisma.promotionDocument.create({
          data: {
            itemId: item.id,
            docType,
            originalName: file.originalname,
            storedPath,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            uploadedBy: req.user!.id,
          },
        });
      } catch (e) {
        fs.rmSync(storedPath, { force: true });
        throw e;
      }
      if (oldDocs.length) {
        await prisma.promotionDocument.deleteMany({ where: { id: { in: oldDocs.map((d) => d.id) } } });
        for (const d of oldDocs) {
          try { fs.rmSync(d.storedPath, { force: true }); } catch { /* best-effort */ }
        }
      }
      return res.status(201).json({
        success: true,
        message: 'Dokumen kenaikan pangkat diupload',
        data: publicDocument(doc, batch.id, item.id),
        meta: null,
        errors: null,
      });
    } catch (e: any) {
      cleanupNew();
      throw e;
    }
  });
});

// GET /promotion-requests/:id/items/:itemId/documents/:docId/download
router.get('/:id/items/:itemId/documents/:docId/download', requirePermission('promotion.view'), async (req, res) => {
  const doc = await prisma.promotionDocument.findFirst({
    where: {
      id: req.params.docId,
      itemId: req.params.itemId,
      item: { batchId: req.params.id },
    },
    include: { item: { select: { employeeId: true } } },
  });
  if (!doc) return fail(res, 404, 'Dokumen tidak ditemukan');
  const scope = employeeScope(req);
  if (scope && doc.item.employeeId !== scope) return fail(res, 403, 'Bukan dokumen usulan Anda');
  if (!fs.existsSync(doc.storedPath)) return fail(res, 404, 'File dokumen tidak ditemukan');
  return res.download(doc.storedPath, doc.originalName);
});

// DELETE /promotion-requests/:id/items/:itemId/documents/:docId
router.delete('/:id/items/:itemId/documents/:docId', requirePermission('promotion.document.upload'), async (req, res) => {
  const batch = await prisma.promotionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Dokumen hanya bisa dihapus saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  const doc = await prisma.promotionDocument.findFirst({
    where: { id: req.params.docId, itemId: req.params.itemId, item: { batchId: batch.id } },
  });
  if (!doc) return fail(res, 404, 'Dokumen tidak ditemukan');
  await prisma.promotionDocument.delete({ where: { id: doc.id } });
  try { fs.rmSync(doc.storedPath, { force: true }); } catch { /* best-effort */ }
  return ok(res, null, 'Dokumen dihapus');
});

// ---------------- Detail & aksi alur ----------------
// GET /promotion-requests/:id
router.get('/:id', requirePermission('promotion.view'), async (req, res) => {
  const scope = employeeScope(req);
  const batch = await prisma.promotionBatch.findUnique({
    where: { id: req.params.id },
    include: includeDetail(scope),
  });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (scope && !canAccessBatch(req, batch)) return fail(res, 403, 'Hanya boleh melihat usulan sendiri');
  return ok(res, await toDetail(batch, req.user!, scope));
});

// POST /promotion-requests/:id/:action
router.post('/:id/:action', async (req, res) => {
  const { action } = req.params;
  const t = TRANSITIONS[action];
  if (!t) return fail(res, 404, `Action tidak dikenal: ${action}`);
  if (!can(req.user!.permissions, t.permission)) {
    return fail(res, 403, `Forbidden: butuh permission ${t.permission}`);
  }
  if (action === 'paraf' && req.user!.role !== 'SUPER_ADMIN' && req.user!.position !== 'SEKCAM') {
    return fail(res, 403, 'Paraf usulan kenaikan pangkat hanya oleh Sekcam');
  }
  if (action === 'approve' && req.user!.role !== 'SUPER_ADMIN' && req.user!.position !== 'CAMAT') {
    return fail(res, 403, 'Persetujuan/tanda tangan usulan kenaikan pangkat hanya oleh Camat');
  }
  if (['legalize', 'register', 'archive'].includes(action) && req.user!.role !== 'SUPER_ADMIN') {
    const org = req.user!.orgUnitId
      ? await prisma.organizationalUnit.findUnique({ where: { id: req.user!.orgUnitId } })
      : null;
    if (!org || org.code !== KECAMATAN_CODE) {
      return fail(res, 403, 'Aksi ini hanya oleh staf kecamatan');
    }
  }

  const schema = actionSchema(action);
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b: any = parsed.data;
  if ((action === 'revise' || action === 'reject') && !b.note) {
    return fail(res, 422, 'Catatan wajib untuk revisi/penolakan');
  }
  if (action === 'verify' && b.documentsComplete !== true) {
    return fail(res, 422, 'Centang konfirmasi dokumen lengkap sebelum memverifikasi');
  }

  const batch = await getBatchForAction(req, req.params.id);
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!t.from.includes(batch.status)) {
    return fail(res, 409, `Status harus ${t.from.join('/')}, saat ini ${batch.status}`);
  }
  if (['revise', 'reject'].includes(action) && req.user!.role !== 'SUPER_ADMIN') {
    const requiredPosition = batch.status === 'LEGALIZED'
      ? 'KASUBAG'
      : batch.status === 'VERIFIED'
        ? 'SEKCAM'
        : batch.status === 'PARAF'
          ? 'CAMAT'
          : null;
    if (requiredPosition && req.user!.position !== requiredPosition) {
      return fail(res, 403, `Aksi ${action} pada tahap ini hanya oleh ${requiredPosition}`);
    }
  }
  if (employeeScope(req)) return fail(res, 403, 'Pegawai tidak boleh menjalankan aksi alur usulan');

  const actorFull = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { employee: true },
  });
  const actorName = actorFull?.employee?.name ?? req.user!.username;
  const now = new Date();
  let timelineNote: string | null = b.note ?? null;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {
        status: t.to,
        currentHolderRole: t.holderAfter,
      };

      if (action === 'legalize') {
        const legalizedAt = b.legalizedAt ? parseYMD(b.legalizedAt) : now;
        if (!legalizedAt) throw new NumberingError(422, 'Tanggal legalisasi tidak valid');
        if (b.legalizedAt && b.legalizedAt > todayYMD()) throw new NumberingError(422, 'Tanggal legalisasi tidak boleh masa depan');
        data.legalizedAt = legalizedAt;
        data.legalizationNote = b.note ?? null;
        data.stampNumber = b.stampNumber?.trim() || null;
        await tx.promotionItem.updateMany({
          where: { batchId: batch.id },
          data: { status: 'LEGALIZED', legalizedAt },
        });
        timelineNote = [
          b.stampNumber ? `Stempel: ${b.stampNumber}` : null,
          b.note,
        ].filter(Boolean).join('; ') || null;
      }

      if (action === 'verify') {
        const notLegalized = (batch.items ?? []).filter((i: any) => i.status !== 'LEGALIZED');
        if (notLegalized.length) {
          throw new NumberingError(409, 'Semua item harus berstatus LEGALIZED sebelum diverifikasi');
        }
        data.verifiedAt = now;
        data.verificationNote = b.note ?? null;
        await tx.promotionItem.updateMany({
          where: { batchId: batch.id },
          data: { status: 'VERIFIED', verifiedAt: now },
        });
      }

      if (action === 'revise') {
        data.revisionNote = b.note;
        await tx.promotionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'REVISION' } });
      }

      if (action === 'reject') {
        data.rejectionReason = b.note;
        await tx.promotionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'REJECTED' } });
      }

      if (action === 'paraf') {
        data.parafAt = now;
        data.parafNote = b.note ?? null;
        await tx.promotionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'PARAF' } });
      }

      if (action === 'approve') {
        data.approvedAt = now;
        data.approvalNote = b.note ?? null;
        await tx.promotionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'APPROVED' } });
      }

      if (action === 'register') {
        const dateStr = b.outgoingLetterDate ?? todayYMD();
        const letterDate = parseYMD(dateStr);
        if (!letterDate) throw new NumberingError(422, 'Tanggal surat keluar tidak valid');
        if (dateStr > todayYMD()) throw new NumberingError(422, 'Tanggal surat keluar tidak boleh masa depan');

        let outgoing: any = null;
        if (b.outgoingLetterId) {
          outgoing = await tx.outgoingLetter.findUnique({ where: { id: b.outgoingLetterId } });
          if (!outgoing) throw new NumberingError(404, 'Surat keluar yang dipilih tidak ditemukan');
          if (outgoing.status === 'CANCELLED') throw new NumberingError(409, 'Surat keluar sudah dibatalkan');
        } else if (!b.outgoingLetterNumber && b.createOutgoingLetter !== false) {
          const classificationCode = b.classificationCode?.trim() || DEFAULT_PROMOTION_CLASSIFICATION;
          const cls = await tx.archiveClassification.findUnique({ where: { code: classificationCode } });
          if (!cls || !cls.isActive) throw new NumberingError(422, 'Kode klasifikasi surat kenaikan pangkat tidak dikenal');
          const alloc = await allocateOutgoingSequence(tx, dateStr);
          const code = b.letterCode?.trim() || cls.code;
          const letterNumber = formatLetterNumber(code, alloc.sequence, letterUnitCode(), dateStr);
          const signer = b.signerName?.trim()
            || (await tx.user.findFirst({
              where: { position: 'CAMAT', isActive: true },
              include: { employee: { select: { name: true } } },
            }))?.employee?.name
            || null;
          outgoing = await tx.outgoingLetter.create({
            data: {
              letterNumber,
              sequenceNumber: alloc.sequence,
              year: Number(dateStr.slice(0, 4)),
              classificationId: cls.id,
              subject: b.subject?.trim()
                || `Usulan Kenaikan Pangkat ASN ${promotionPeriodLabel(batch.periodYear, batch.periodMonth)}`,
              recipient: b.recipient?.trim() || 'BKPSDMD Kota Makassar',
              personInCharge: b.personInCharge?.trim() || actorFull?.employee?.name || null,
              letterCode: b.letterCode?.trim() || null,
              letterDate,
              signerName: signer,
              status: 'ISSUED',
              issuedAt: now,
              createdBy: req.user!.id,
            },
          });
          await claimOutgoingBuffer(tx, alloc.bufferId, outgoing.id);
        }

        const outgoingLetterNumber = outgoing?.letterNumber ?? b.outgoingLetterNumber?.trim() ?? null;
        const outgoingLetterDate = outgoing?.letterDate ?? letterDate;
        const agendaNumber = b.agendaNumber?.trim() || outgoingLetterNumber;
        if (!agendaNumber) throw new NumberingError(422, 'Nomor surat/agenda wajib diisi');
        const sentAt = b.sentAt ? parseYMD(b.sentAt) : now;
        if (!sentAt) throw new NumberingError(422, 'Tanggal kirim tidak valid');
        data.outgoingLetterId = outgoing?.id ?? b.outgoingLetterId ?? null;
        data.outgoingLetterNumber = outgoingLetterNumber;
        data.outgoingLetterDate = outgoingLetterDate;
        data.agendaNumber = agendaNumber;
        data.registeredAt = now;
        data.sentAt = sentAt;
        await tx.promotionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'REGISTERED' } });
        timelineNote = [
          `Nomor surat: ${outgoingLetterNumber ?? '-'}`,
          `Nomor agenda: ${agendaNumber}`,
          b.note,
        ].filter(Boolean).join('; ');
      }

      if (action === 'archive') {
        const dateStr = b.archiveDate ?? todayYMD();
        const archiveDate = parseYMD(dateStr);
        if (!archiveDate) throw new NumberingError(422, 'Tanggal arsip tidak valid');
        if (dateStr > todayYMD()) throw new NumberingError(422, 'Tanggal arsip tidak boleh masa depan');
        const retentionUntil = b.retentionUntil ? parseYMD(b.retentionUntil) : null;
        if (b.retentionUntil && !retentionUntil) throw new NumberingError(422, 'Tanggal retensi tidak valid');
        if (retentionUntil && retentionUntil < archiveDate) {
          throw new NumberingError(422, 'Retensi tidak boleh sebelum tanggal arsip');
        }
        data.archivedAt = now;
        await tx.promotionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'ARCHIVED' } });

        let archiveNumber: string | null = batch.outgoingLetter?.archiveRecord?.archiveNumber ?? null;
        if (batch.outgoingLetter?.id && !batch.outgoingLetter.archiveRecord) {
          const outgoing = await tx.outgoingLetter.findUnique({
            where: { id: batch.outgoingLetter.id },
            include: { classification: true, archiveRecord: true },
          });
          if (outgoing && !outgoing.archiveRecord) {
            const category = b.category ?? 'AKTIF';
            archiveNumber = await nextArchiveNumber(tx, archiveDate.getUTCFullYear());
            await tx.archiveRecord.create({
              data: {
                archiveNumber,
                sourceType: 'OUTGOING',
                outgoingLetterId: outgoing.id,
                classificationId: outgoing.classificationId,
                code: b.code?.trim() || outgoing.classification?.code || DEFAULT_PROMOTION_CLASSIFICATION,
                bundleCode: b.bundleCode?.trim() || null,
                title: outgoing.subject,
                documentNumber: outgoing.letterNumber,
                documentDate: outgoing.letterDate,
                archiveDate,
                category,
                location: locationForCategory(category),
                retentionUntil,
                notes: b.notes?.trim() || b.note?.trim() || null,
                createdBy: req.user!.id,
              },
            });
          }
        }
        timelineNote = [
          archiveNumber ? `Nomor arsip: ${archiveNumber}` : null,
          b.notes ?? b.note ?? null,
        ].filter(Boolean).join('; ') || null;
      }

      const u = await tx.promotionBatch.update({ where: { id: batch.id }, data });
      await tx.promotionApproval.create({
        data: {
          batchId: batch.id,
          actorUserId: req.user!.id,
          actorRole: req.user!.role,
          actorPosition: req.user!.position,
          fromStatus: batch.status,
          toStatus: t.to,
          action: action.toUpperCase(),
          note: timelineNote,
        },
      });
      return u;
    });

    await notifyPromotionTransition({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      action,
      fromStatus: batch.status,
      toStatus: t.to,
      actorId: req.user!.id,
      actorName,
      actorPosition: req.user!.position,
      note: timelineNote,
    });

    const full = await prisma.promotionBatch.findUnique({
      where: { id: updated.id },
      include: includeDetail(),
    });
    return ok(res, await toDetail(full, req.user!), `${action} berhasil`);
  } catch (e: any) {
    if (e instanceof NumberingError) return fail(res, e.status, e.message);
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor surat/agenda/arsip bentrok, ulangi');
    throw e;
  }
});

// DELETE /promotion-requests/:id (hanya draf/revisi)
router.delete('/:id', requirePermission('promotion.create'), async (req, res) => {
  const batch = await prisma.promotionBatch.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { documents: true } } },
  });
  if (!batch) return fail(res, 404, 'Usulan kenaikan pangkat tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Hanya DRAFT/REVISION yang bisa dihapus (saat ini ${batch.status})`);
  }
  const docs = batch.items.flatMap((i) => i.documents);
  await prisma.promotionBatch.delete({ where: { id: batch.id } });
  for (const d of docs) {
    try { fs.rmSync(d.storedPath, { force: true }); } catch { /* best-effort */ }
  }
  return ok(res, null, 'Draf usulan kenaikan pangkat dihapus');
});

export default router;
