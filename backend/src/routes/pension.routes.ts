import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { deleteStoredFile, sendStoredFile, storeUploadedFile } from '../lib/storage';
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
  PENSION_ACTION_LABELS,
  PENSION_DOC_TYPES,
  PENSION_OTHER_DOC,
  PENSION_REQUIRED_DOCS,
  PENSION_STATUS_LABELS,
  PENSION_TYPES,
  TRANSITIONS,
  availableActions,
  computeAge,
  computeRetirementDate,
  computeYearsOfService,
  daysBetween,
  missingPensionDocs,
  monthsBetween,
  pensionDocChecklist,
  pensionPeriodLabel,
  ymd,
} from '../services/pension.service';

const router = Router();
router.use(authRequired);

const KECAMATAN_CODE = 'KEC-TAMALATE';
const DEFAULT_PENSION_CLASSIFICATION = '800.1.6.6'; // Pensiun ASN

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
      retirementDate: true,
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
    downloadUrl: `/api/v1/pension-requests/${batchId}/items/${itemId}/documents/${d.id}/download`,
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

function filterActionsForUser(actions: string[], user: any): string[] {
  return actions.filter((action) => {
    if (action === 'paraf') return user.role === 'SUPER_ADMIN' || user.position === 'SEKCAM';
    if (action === 'approve') return user.role === 'SUPER_ADMIN' || user.position === 'CAMAT';
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
      documents: docs.map((d: any) => publicDocument(d, r.id, item.id)),
      documentsChecklist: pensionDocChecklist(docs),
      missingDocuments: missingPensionDocs(docs),
    };
  });
  const available = filterActionsForUser(availableActions(r.status, user.permissions), user);
  const s = await signers();
  return {
    ...r,
    items,
    statusLabel: PENSION_STATUS_LABELS[r.status] ?? r.status,
    availableActions: available,
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
  return prisma.pensionBatch.findUnique({
    where: { id },
    include: {
      items: { include: { employee: true } },
      outgoingLetter: outgoingMini,
    },
  });
}

function actionSchema(action: string) {
  const note = z.string().max(2000).optional();
  switch (action) {
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
        outgoingLetterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        agendaNumber: z.string().min(1).max(50).optional(),
        createOutgoingLetter: z.boolean().optional(),
        classificationCode: z.string().max(30).optional(),
        letterCode: z.string().max(30).optional(),
        subject: z.string().min(5).max(500).optional(),
        recipient: z.string().max(200).optional(),
        signerName: z.string().max(150).optional(),
        personInCharge: z.string().max(150).optional(),
        note,
      });
    case 'expedite':
      return z.object({
        expeditionNumber: z.string().min(1).max(50).optional(),
        expeditionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        courierName: z.string().min(1, 'Nama pendistribusi wajib').max(150),
        note,
      });
    case 'send':
      return z.object({
        receiptNumber: z.string().min(1, 'Nomor tanda terima wajib').max(100),
        receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tanda terima wajib'),
        receivedBy: z.string().max(150).optional(),
        note,
      });
    default:
      return z.object({ note });
  }
}

// ---------------- Notifikasi alur ----------------
const NEXT_PERMISSION: Record<string, string | null> = {
  verify: 'pension.paraf',
  revise: 'pension.verify',
  paraf: 'pension.approve',
  approve: 'pension.register',
  register: 'pension.expedite',
  expedite: 'pension.send',
  send: null,
  complete: null,
  archive: null,
  reject: null,
};

async function pensionUsersForPermission(code: string): Promise<string[]> {
  const ids = await usersForPermission(code);
  if (code === 'pension.paraf') {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, position: 'SEKCAM', isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (code === 'pension.approve') {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, position: 'CAMAT', isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  return ids;
}

async function notifyPensionTransition(opts: {
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
      for (const id of await pensionUsersForPermission(next)) ids.add(id);
    }
    const items = await prisma.pensionItem.findMany({
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
    const label = PENSION_ACTION_LABELS[opts.action] ?? opts.action;
    await prisma.notification.createMany({
      data: [...ids].map((userId) => ({
        userId,
        type: 'PENSIUN',
        title: `Usulan Pensiun ${opts.batchNumber} ${label}`,
        body: `${opts.actorName}${opts.actorPosition ? ` (${opts.actorPosition})` : ''}: ${opts.fromStatus} -> ${opts.toStatus}${opts.note ? ` - ${opts.note}` : ''}`,
        referenceType: 'pension_batch',
        referenceId: opts.batchId,
      })),
    });
  } catch (e) {
    console.error('notify pensiun gagal:', (e as Error).message);
  }
}

// ---------------- Daftar BUP ----------------
// GET /pension-requests/bup?year=2026&from=2026-01-01&to=2026-12-31&bupAge=58
router.get('/bup', requirePermission('pension.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Daftar BUP hanya untuk petugas kepegawaian');
  const now = new Date();
  const year = (req.query as any).year ? Number((req.query as any).year) : now.getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return fail(res, 422, 'year tidak valid');
  }
  const bupAge = (req.query as any).bupAge ? Number((req.query as any).bupAge) : env.pensionBupAge;
  if (!Number.isInteger(bupAge) || bupAge < 50 || bupAge > 65) {
    return fail(res, 422, 'bupAge harus 50-65');
  }
  const from = parseYMD((req.query as any).from) ?? new Date(Date.UTC(year, 0, 1));
  const to = parseYMD((req.query as any).to) ?? new Date(Date.UTC(year, 11, 31));
  if (from > to) return fail(res, 422, 'Rentang tanggal tidak valid');

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    include: { orgUnit: true },
    orderBy: { name: 'asc' },
  });

  const ids = employees.map((e) => e.id);
  const existingItems = ids.length
    ? await prisma.pensionItem.findMany({
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
  let missingBirthDate = 0;
  for (const e of employees) {
    if (!e.birthDate) {
      missingBirthDate += 1;
      continue;
    }
    const retirementDate = computeRetirementDate(e.birthDate, bupAge);
    if (retirementDate < from || retirementDate > to) continue;
    const age = computeAge(e.birthDate, now);
    const existing = existingByEmployee.get(e.id) ?? null;
    rows.push({
      employee: {
        id: e.id,
        nip: e.nip,
        employeeNumber: e.employeeNumber,
        name: e.name,
        gender: e.gender,
        rank: e.rank,
        position: e.position,
        employmentStatus: e.employmentStatus,
        orgUnit: e.orgUnit ? { id: e.orgUnit.id, code: e.orgUnit.code, name: e.orgUnit.name } : null,
      },
      birthDate: ymd(e.birthDate),
      age,
      retirementDate: ymd(retirementDate),
      bupAge,
      yearsOfService: computeYearsOfService(e.joinDate, retirementDate),
      monthsUntil: monthsBetween(now, retirementDate),
      daysUntil: daysBetween(now, retirementDate),
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
  rows.sort((a, b) => a.retirementDate.localeCompare(b.retirementDate));
  return ok(res, rows, 'ok', {
    total: rows.length,
    from: ymd(from),
    to: ymd(to),
    bupAge,
    missingBirthDate,
    alreadyInBatch: rows.filter((r) => r.existingItem).length,
  });
});

// ---------------- Checklist dokumen ----------------
router.get('/required-docs', requirePermission('pension.view'), async (_req, res) => {
  return ok(res, {
    required: PENSION_REQUIRED_DOCS,
    otherDocType: PENSION_OTHER_DOC,
    acceptedTypes: PENSION_DOC_TYPES,
    note: 'Checklist ini tampil di langkah verifikasi. Petugas tetap mengonfirmasi kelengkapan sebelum status VERIFIED.',
  });
});

// ---------------- Buku register / daftar nominatif / ekspedisi ----------------
router.get('/register', requirePermission('pension.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Buku register hanya untuk petugas kepegawaian');
  const { year, status, q } = req.query as any;
  const y = year ? Number(year) : null;
  if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return fail(res, 422, 'year tidak valid');
  const where: any = {};
  if (y !== null) where.periodYear = y;
  if (status) where.status = String(status);
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
  const batches = await prisma.pensionBatch.findMany({
    where,
    include: {
      outgoingLetter: outgoingMini,
      items: {
        ...(scope ? { where: { employeeId: scope } } : {}),
        select: {
          id: true,
          employeeName: true,
          employeeNip: true,
          retirementDate: true,
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
    periodLabel: pensionPeriodLabel(b.periodYear, b.periodMonth),
    status: b.status,
    statusLabel: PENSION_STATUS_LABELS[b.status] ?? b.status,
    jumlahPegawai: b.items.length,
    pegawai: b.items.map((i: any) => ({
      name: i.employeeName,
      nip: i.employeeNip,
      retirementDate: dateOrNull(i.retirementDate),
      status: i.status,
    })),
    nomorSurat: b.outgoingLetterNumber ?? b.outgoingLetter?.letterNumber ?? null,
    tanggalSurat: dateOrNull(b.outgoingLetterDate ?? b.outgoingLetter?.letterDate),
    nomorAgenda: b.agendaNumber,
    nomorEkspedisi: b.expeditionNumber,
    tanggalEkspedisi: dateOrNull(b.expeditionDate),
    nomorTandaTerima: b.receiptNumber,
    tanggalTandaTerima: dateOrNull(b.receiptDate),
    createdAt: dateOrNull(b.createdAt),
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

router.get('/nominative', requirePermission('pension.view'), async (req, res) => {
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
  const scope = employeeScope(req);
  if (scope) where.employeeId = scope;
  if (q) {
    where.OR = [
      { employeeName: { contains: String(q), mode: 'insensitive' } },
      { employeeNip: { contains: String(q), mode: 'insensitive' } },
      { batch: { batchNumber: { contains: String(q), mode: 'insensitive' } } },
    ];
  }
  const items = await prisma.pensionItem.findMany({
    where,
    include: {
      batch: {
        include: { outgoingLetter: outgoingMini },
      },
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
    periodLabel: pensionPeriodLabel(item.batch.periodYear, item.batch.periodMonth),
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    employeeNip: item.employeeNip,
    employeeNumber: item.employeeNumber,
    rank: item.rank,
    position: item.position,
    orgUnitName: item.orgUnitName,
    birthDate: dateOrNull(item.birthDate),
    retirementDate: dateOrNull(item.retirementDate),
    bupAge: item.bupAge,
    yearsOfService: item.yearsOfService,
    pensionType: item.pensionType,
    itemStatus: item.status,
    batchStatus: item.batch.status,
    statusLabel: PENSION_STATUS_LABELS[item.batch.status] ?? item.batch.status,
    documentsChecklist: pensionDocChecklist(item.documents ?? []),
    missingDocuments: missingPensionDocs(item.documents ?? []),
    nomorSurat: item.batch.outgoingLetterNumber ?? item.batch.outgoingLetter?.letterNumber ?? null,
    nomorAgenda: item.batch.agendaNumber,
    nomorTandaTerima: item.batch.receiptNumber,
    tanggalTandaTerima: dateOrNull(item.batch.receiptDate),
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

router.get('/expedition-book', requirePermission('pension.view'), async (req, res) => {
  if (employeeOnlyBooks(req)) return fail(res, 403, 'Buku ekspedisi hanya untuk petugas kepegawaian');
  const { year, from, to } = req.query as any;
  const y = year ? Number(year) : null;
  if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return fail(res, 422, 'year tidak valid');
  const fromDate = from ? parseYMD(String(from)) : null;
  const toDate = to ? parseYMD(String(to)) : null;
  if ((from && !fromDate) || (to && !toDate)) return fail(res, 422, 'Rentang tanggal tidak valid');
  const where: any = { expeditionDate: { not: null } };
  if (y !== null) where.periodYear = y;
  if (fromDate || toDate) {
    where.expeditionDate = {
      not: null,
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }
  const scope = employeeScope(req);
  if (scope) where.items = { some: { employeeId: scope } };
  const batches = await prisma.pensionBatch.findMany({
    where,
    include: {
      outgoingLetter: outgoingMini,
      items: {
        ...(scope ? { where: { employeeId: scope } } : {}),
        select: { employeeName: true, employeeNip: true },
      },
    },
    orderBy: { expeditionDate: 'desc' },
  });
  const rows = batches.map((b: any) => ({
    id: b.id,
    tanggalEkspedisi: dateOrNull(b.expeditionDate),
    nomorEkspedisi: b.expeditionNumber,
    nomorSurat: b.outgoingLetterNumber ?? b.outgoingLetter?.letterNumber ?? null,
    tujuan: b.outgoingLetter?.recipient ?? 'BKPSDMD Kota Makassar',
    penerima: b.courierName,
    jumlahPegawai: b.items.length,
    pegawai: b.items,
    status: b.status,
    statusLabel: PENSION_STATUS_LABELS[b.status] ?? b.status,
    catatan: b.expeditionNote,
  }));
  return ok(res, rows, 'ok', { total: rows.length });
});

// ---------------- CRUD / daftar usulan ----------------
// GET /pension-requests
router.get('/', requirePermission('pension.view'), async (req, res) => {
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
    prisma.pensionBatch.count({ where }),
    prisma.pensionBatch.findMany({
      where,
      include: listIncludeFor(scope),
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// POST /pension-requests (langkah 1-2: buat draf daftar nominatif)
router.post('/', requirePermission('pension.create'), async (req, res) => {
  const schema = z.object({
    periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
    periodMonth: z.coerce.number().int().min(1).max(12).optional(),
    bupAge: z.coerce.number().int().min(50).max(65).optional(),
    note: z.string().max(2000).optional(),
    items: z.array(z.object({
      employeeId: z.string().uuid(),
      pensionType: z.enum(PENSION_TYPES as unknown as [string, ...string[]]).optional(),
      note: z.string().max(1000).optional(),
    })).optional(),
    employeeIds: z.array(z.string().uuid()).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const requested = b.items?.length
    ? b.items
    : (b.employeeIds ?? []).map((employeeId) => ({ employeeId, pensionType: 'BUP' as string, note: undefined }));
  if (!requested.length) return fail(res, 422, 'Minimal satu PNS harus dipilih dari daftar BUP');
  const ids = requested.map((x) => x.employeeId);
  if (new Set(ids).size !== ids.length) return fail(res, 422, 'Ada PNS yang dipilih lebih dari sekali');

  const employees = await prisma.employee.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { orgUnit: true },
  });
  const found = new Map(employees.map((e) => [e.id, e]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) return fail(res, 422, `Pegawai tidak ditemukan/tidak aktif: ${missing.join(', ')}`);
  const noBirthDate = employees.filter((e) => !e.birthDate);
  if (noBirthDate.length) {
    return fail(res, 422, `Tanggal lahir belum diisi: ${noBirthDate.map((e) => e.name).join(', ')}`);
  }

  const periodYear = b.periodYear ?? new Date().getUTCFullYear();
  const bupAge = b.bupAge ?? env.pensionBupAge;
  const prefix = `PENSIUN-${periodYear}-`;
  const sequence = await prisma.pensionBatch.count({ where: { batchNumber: { startsWith: prefix } } }) + 1;
  const batchNumber = `${prefix}${String(sequence).padStart(4, '0')}`;

  const itemData = requested.map((x) => {
    const e = found.get(x.employeeId)!;
    const retirementDate = computeRetirementDate(e.birthDate!, bupAge);
    return {
      employeeId: e.id,
      employeeName: e.name,
      employeeNip: e.nip,
      employeeNumber: e.employeeNumber,
      rank: e.rank,
      position: e.position,
      orgUnitName: e.orgUnit?.name ?? null,
      birthDate: e.birthDate!,
      retirementDate,
      bupAge,
      yearsOfService: computeYearsOfService(e.joinDate, retirementDate),
      pensionType: x.pensionType ?? 'BUP',
      note: x.note,
      status: 'PENDING',
    };
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.pensionBatch.create({
        data: {
          batchNumber,
          periodYear,
          periodMonth: b.periodMonth ?? null,
          bupAge,
          status: 'DRAFT',
          currentHolderRole: 'KASUBAG',
          note: b.note,
          submittedAt: new Date(),
          createdBy: req.user!.id,
          items: { create: itemData },
        },
        include: includeDetail(),
      });
      await tx.pensionApproval.create({
        data: {
          batchId: batch.id,
          actorUserId: req.user!.id,
          actorRole: req.user!.role,
          actorPosition: req.user!.position,
          fromStatus: '-',
          toStatus: 'DRAFT',
          action: 'CREATE',
          note: `Draf daftar nominatif ${pensionPeriodLabel(periodYear, b.periodMonth ?? null)}`,
        },
      });
      return batch;
    });
    return res.status(201).json({
      success: true,
      message: 'Draf daftar usulan pensiun dibuat',
      data: await toDetail(created, req.user!),
      meta: null,
      errors: null,
    });
  } catch (e: any) {
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor usulan bentrok, ulangi');
    throw e;
  }
});

// PATCH /pension-requests/:id (DRAFT/REVISION)
router.patch('/:id', requirePermission('pension.create'), async (req, res) => {
  const batch = await prisma.pensionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Hanya DRAFT/REVISION yang bisa diubah (saat ini ${batch.status})`);
  }
  const schema = z.object({
    note: z.string().max(2000).optional(),
    periodMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const updated = await prisma.pensionBatch.update({
    where: { id: batch.id },
    data: parsed.data,
    include: includeDetail(),
  });
  return ok(res, await toDetail(updated, req.user!));
});

// POST /pension-requests/:id/items (tambah PNS ke draf/revisi)
router.post('/:id/items', requirePermission('pension.create'), async (req, res) => {
  const batch = await prisma.pensionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Item hanya bisa ditambah saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  const schema = z.object({
    employeeIds: z.array(z.string().uuid()).optional(),
    items: z.array(z.object({
      employeeId: z.string().uuid(),
      pensionType: z.enum(PENSION_TYPES as unknown as [string, ...string[]]).optional(),
      note: z.string().max(1000).optional(),
    })).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const requested = b.items?.length
    ? b.items
    : (b.employeeIds ?? []).map((employeeId) => ({ employeeId, pensionType: 'BUP' as string, note: undefined }));
  if (!requested.length) return fail(res, 422, 'Minimal satu PNS harus dipilih');

  const existing = await prisma.pensionItem.findMany({
    where: { batchId: batch.id },
    select: { employeeId: true },
  });
  const existingIds = new Set(existing.map((i) => i.employeeId));
  const fresh = requested.filter((x) => !existingIds.has(x.employeeId));
  if (!fresh.length) return fail(res, 409, 'Semua PNS yang dipilih sudah ada di usulan ini');

  const ids = fresh.map((x) => x.employeeId);
  const employees = await prisma.employee.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { orgUnit: true },
  });
  const found = new Map(employees.map((e) => [e.id, e]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) return fail(res, 422, `Pegawai tidak ditemukan/tidak aktif: ${missing.join(', ')}`);
  const noBirthDate = employees.filter((e) => !e.birthDate);
  if (noBirthDate.length) {
    return fail(res, 422, `Tanggal lahir belum diisi: ${noBirthDate.map((e) => e.name).join(', ')}`);
  }

  const itemData = fresh.map((x) => {
    const e = found.get(x.employeeId)!;
    const retirementDate = computeRetirementDate(e.birthDate!, batch.bupAge);
    return {
      batchId: batch.id,
      employeeId: e.id,
      employeeName: e.name,
      employeeNip: e.nip,
      employeeNumber: e.employeeNumber,
      rank: e.rank,
      position: e.position,
      orgUnitName: e.orgUnit?.name ?? null,
      birthDate: e.birthDate!,
      retirementDate,
      bupAge: batch.bupAge,
      yearsOfService: computeYearsOfService(e.joinDate, retirementDate),
      pensionType: x.pensionType ?? 'BUP',
      note: x.note,
      status: 'PENDING',
    };
  });
  await prisma.$transaction(async (tx) => {
    await tx.pensionItem.createMany({ data: itemData, skipDuplicates: true });
    await tx.pensionApproval.create({
      data: {
        batchId: batch.id,
        actorUserId: req.user!.id,
        actorRole: req.user!.role,
        actorPosition: req.user!.position,
        fromStatus: batch.status,
        toStatus: batch.status,
        action: 'ADD_ITEM',
        note: `Menambahkan ${itemData.length} PNS ke daftar nominatif`,
      },
    });
  });
  const full = await prisma.pensionBatch.findUnique({ where: { id: batch.id }, include: includeDetail() });
  return ok(res, await toDetail(full, req.user!));
});

// DELETE /pension-requests/:id/items/:itemId
router.delete('/:id/items/:itemId', requirePermission('pension.create'), async (req, res) => {
  const batch = await prisma.pensionBatch.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Item hanya bisa dihapus saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  if (batch.items.length <= 1) return fail(res, 422, 'Usulan harus memiliki minimal satu PNS');
  const item = batch.items.find((i) => i.id === req.params.itemId);
  if (!item) return fail(res, 404, 'Item usulan tidak ditemukan');
  const docs = await prisma.pensionDocument.findMany({ where: { itemId: item.id } });
  await prisma.pensionItem.delete({ where: { id: item.id } });
  for (const d of docs) {
    await deleteStoredFile(d.storedPath).catch(() => undefined);
  }
  const full = await prisma.pensionBatch.findUnique({ where: { id: batch.id }, include: includeDetail() });
  return ok(res, await toDetail(full, req.user!), 'PNS dihapus dari daftar nominatif');
});

// ---------------- Dokumen ----------------
// POST /pension-requests/:id/items/:itemId/documents
router.post('/:id/items/:itemId/documents', requirePermission('pension.document.upload'), (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    const file = (req as any).file;
    const cleanupNew = () => { if (file?.path) fs.rmSync(file.path, { force: true }); };
    if (err) {
      cleanupNew();
      return fail(res, 400, err.message);
    }
    if (!file) return fail(res, 422, 'file wajib (pdf/jpg/png, max 5MB)');
    try {
      const batch = await prisma.pensionBatch.findUnique({ where: { id: req.params.id } });
      if (!batch) { cleanupNew(); return fail(res, 404, 'Usulan pensiun tidak ditemukan'); }
      if (!['DRAFT', 'REVISION'].includes(batch.status)) {
        cleanupNew();
        return fail(res, 409, `Upload dokumen hanya saat DRAFT/REVISION (saat ini ${batch.status})`);
      }
      const item = await prisma.pensionItem.findFirst({
        where: { id: req.params.itemId, batchId: batch.id },
      });
      if (!item) { cleanupNew(); return fail(res, 404, 'Item usulan tidak ditemukan'); }
      const docType = String((req.body ?? {}).docType ?? '');
      if (!PENSION_DOC_TYPES.includes(docType as any)) {
        cleanupNew();
        return fail(res, 422, `docType tidak dikenal. Gunakan: ${PENSION_DOC_TYPES.join(', ')}`);
      }
      const storedPath = await storeUploadedFile(file, `pension/${batch.id}/items/${item.id}`);
      const oldDocs = await prisma.pensionDocument.findMany({ where: { itemId: item.id, docType } });
      let doc;
      try {
        doc = await prisma.pensionDocument.create({
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
        await deleteStoredFile(storedPath).catch(() => undefined);
        throw e;
      }
      if (oldDocs.length) {
        await prisma.pensionDocument.deleteMany({ where: { id: { in: oldDocs.map((d) => d.id) } } });
        for (const d of oldDocs) {
          await deleteStoredFile(d.storedPath).catch(() => undefined);
        }
      }
      return res.status(201).json({
        success: true,
        message: 'Dokumen pensiun diupload',
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

// GET /pension-requests/:id/items/:itemId/documents/:docId/download
router.get('/:id/items/:itemId/documents/:docId/download', requirePermission('pension.view'), async (req, res) => {
  const doc = await prisma.pensionDocument.findFirst({
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
  if (!(await sendStoredFile(res, doc.storedPath, doc.originalName, doc.mimeType))) return fail(res, 404, 'File dokumen tidak ditemukan');
  return;
});

// DELETE /pension-requests/:id/items/:itemId/documents/:docId
router.delete('/:id/items/:itemId/documents/:docId', requirePermission('pension.document.upload'), async (req, res) => {
  const batch = await prisma.pensionBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Dokumen hanya bisa dihapus saat DRAFT/REVISION (saat ini ${batch.status})`);
  }
  const doc = await prisma.pensionDocument.findFirst({
    where: { id: req.params.docId, itemId: req.params.itemId, item: { batchId: batch.id } },
  });
  if (!doc) return fail(res, 404, 'Dokumen tidak ditemukan');
  await prisma.pensionDocument.delete({ where: { id: doc.id } });
  await deleteStoredFile(doc.storedPath).catch(() => undefined);
  return ok(res, null, 'Dokumen dihapus');
});

// ---------------- Detail & aksi alur ----------------
// GET /pension-requests/:id
router.get('/:id', requirePermission('pension.view'), async (req, res) => {
  const scope = employeeScope(req);
  const batch = await prisma.pensionBatch.findUnique({
    where: { id: req.params.id },
    include: includeDetail(scope),
  });
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (scope && !canAccessBatch(req, batch)) return fail(res, 403, 'Hanya boleh melihat usulan sendiri');
  return ok(res, await toDetail(batch, req.user!, scope));
});

// POST /pension-requests/:id/:action
router.post('/:id/:action', async (req, res) => {
  const { action } = req.params;
  const t = TRANSITIONS[action];
  if (!t) return fail(res, 404, `Action tidak dikenal: ${action}`);
  if (!can(req.user!.permissions, t.permission)) {
    return fail(res, 403, `Forbidden: butuh permission ${t.permission}`);
  }
  if (action === 'paraf' && req.user!.role !== 'SUPER_ADMIN' && req.user!.position !== 'SEKCAM') {
    return fail(res, 403, 'Paraf usulan pensiun hanya oleh Sekcam');
  }
  if (action === 'approve' && req.user!.role !== 'SUPER_ADMIN' && req.user!.position !== 'CAMAT') {
    return fail(res, 403, 'Persetujuan/tanda tangan usulan pensiun hanya oleh Camat');
  }
  if (['register', 'expedite'].includes(action) && req.user!.role !== 'SUPER_ADMIN') {
    const org = req.user!.orgUnitId
      ? await prisma.organizationalUnit.findUnique({ where: { id: req.user!.orgUnitId } })
      : null;
    if (!org || org.code !== KECAMATAN_CODE) {
      return fail(res, 403, 'Registrasi/ekspedisi usulan pensiun hanya oleh staf kecamatan');
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
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (!t.from.includes(batch.status)) {
    return fail(res, 409, `Status harus ${t.from.join('/')}, saat ini ${batch.status}`);
  }
  if (employeeScope(req)) {
    return fail(res, 403, 'Pegawai tidak boleh menjalankan aksi alur usulan');
  }

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
      if (action === 'verify') {
        data.verifiedAt = now;
        data.verificationNote = b.note ?? null;
        await tx.pensionItem.updateMany({
          where: { batchId: batch.id },
          data: { status: 'VERIFIED', verifiedAt: now },
        });
      }
      if (action === 'revise') {
        data.revisionNote = b.note;
        await tx.pensionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'REVISION' } });
      }
      if (action === 'reject') {
        data.rejectionReason = b.note;
        await tx.pensionItem.updateMany({ where: { batchId: batch.id }, data: { status: 'REJECTED' } });
      }
      if (action === 'paraf') {
        data.parafAt = now;
        data.parafNote = b.note ?? null;
      }
      if (action === 'approve') {
        data.approvedAt = now;
        data.approvalNote = b.note ?? null;
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
          const classificationCode = b.classificationCode?.trim() || DEFAULT_PENSION_CLASSIFICATION;
          const cls = await tx.archiveClassification.findUnique({ where: { code: classificationCode } });
          if (!cls || !cls.isActive) throw new NumberingError(422, 'Kode klasifikasi surat pensiun tidak dikenal');
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
                || `Usulan Pensiun PNS ${pensionPeriodLabel(batch.periodYear, batch.periodMonth)}`,
              recipient: b.recipient?.trim() || 'BKPSDMD Kota Makassar',
              personInCharge: b.personInCharge?.trim() || actorFull?.employee?.name || null,
              letterCode: b.letterCode?.trim() || null,
              letterDate,
              signerName: signer,
              status: 'TERKIRIM',
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
        data.outgoingLetterId = outgoing?.id ?? b.outgoingLetterId ?? null;
        data.outgoingLetterNumber = outgoingLetterNumber;
        data.outgoingLetterDate = outgoingLetterDate;
        data.agendaNumber = agendaNumber;
        data.registeredAt = now;
        data.stampedAt = now;
        timelineNote = [
          `Nomor surat: ${outgoingLetterNumber ?? '-'}`,
          `Nomor agenda: ${agendaNumber}`,
          b.note,
        ].filter(Boolean).join('; ');
      }
      if (action === 'expedite') {
        const dateStr = b.expeditionDate ?? todayYMD();
        const expeditionDate = parseYMD(dateStr);
        if (!expeditionDate) throw new NumberingError(422, 'Tanggal ekspedisi tidak valid');
        data.expeditionNumber = b.expeditionNumber?.trim() || `EKSP-${batch.batchNumber}`;
        data.expeditionDate = expeditionDate;
        data.courierName = b.courierName;
        data.expeditionNote = b.note ?? null;
        data.expeditedAt = now;
        timelineNote = `Ekspedisi ${data.expeditionNumber}; pendistribusi: ${b.courierName}${b.note ? `; ${b.note}` : ''}`;
      }
      if (action === 'send') {
        const receiptDate = parseYMD(b.receiptDate);
        if (!receiptDate) throw new NumberingError(422, 'Tanggal tanda terima tidak valid');
        data.receiptNumber = b.receiptNumber;
        data.receiptDate = receiptDate;
        data.receivedBy = b.receivedBy?.trim() || 'BKPSDMD Kota Makassar';
        data.sendNote = b.note ?? null;
        data.sentAt = now;
        timelineNote = `Tanda terima ${b.receiptNumber} (${b.receiptDate})${b.note ? `; ${b.note}` : ''}`;
      }
      if (action === 'complete') data.completedAt = now;
      if (action === 'archive') data.archivedAt = now;

      const u = await tx.pensionBatch.update({ where: { id: batch.id }, data });
      await tx.pensionApproval.create({
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

    await notifyPensionTransition({
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

    const full = await prisma.pensionBatch.findUnique({
      where: { id: updated.id },
      include: includeDetail(),
    });
    return ok(res, await toDetail(full, req.user!), `${action} berhasil`);
  } catch (e: any) {
    if (e instanceof NumberingError) return fail(res, e.status, e.message);
    if (e?.code === 'P2002') return fail(res, 409, 'Nomor surat/agenda bentrok, ulangi');
    throw e;
  }
});

// DELETE /pension-requests/:id (hanya draf/revisi)
router.delete('/:id', requirePermission('pension.create'), async (req, res) => {
  const batch = await prisma.pensionBatch.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { documents: true } } },
  });
  if (!batch) return fail(res, 404, 'Usulan pensiun tidak ditemukan');
  if (!['DRAFT', 'REVISION'].includes(batch.status)) {
    return fail(res, 409, `Hanya DRAFT/REVISION yang bisa dihapus (saat ini ${batch.status})`);
  }
  const docs = batch.items.flatMap((i) => i.documents);
  await prisma.pensionBatch.delete({ where: { id: batch.id } });
  for (const d of docs) {
    await deleteStoredFile(d.storedPath).catch(() => undefined);
  }
  return ok(res, null, 'Draf usulan pensiun dihapus');
});

export default router;
