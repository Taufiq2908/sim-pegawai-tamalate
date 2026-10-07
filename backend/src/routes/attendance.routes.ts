import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { ok, fail } from '../utils/response';
import {
  todayYMD,
  autoStatus,
  parseYMD,
  checkInUTC,
  deadlineMinutes,
  makassarParts,
  isFridayWita,
  hhmmWita,
  workdaysOfWeek,
} from '../services/attendance.service';

const router = Router();
router.use(authRequired);

const STATUS = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA'] as const;
const PRESENCE = ['HADIR', 'TERLAMBAT'];

const includeEmp = {
  employee: { include: { orgUnit: true } },
};

// ---------- POST /attendances/check-in (pegawai mencatat apel hari ini) ----------
router.post('/check-in', requirePermission('attendance.checkin'), async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) return fail(res, 422, 'User ini tidak terhubung ke data employee');
  const now = new Date();
  const dateStr = todayYMD(now);
  const date = parseYMD(dateStr)!;

  const exists = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
  if (exists) return fail(res, 409, 'Sudah presensi hari ini');

  const deadline = deadlineMinutes(env.apelDeadline);
  const status = autoStatus(now, deadline);
  const record = await prisma.attendance.create({
    data: {
      employeeId,
      date,
      checkInAt: now,
      status,
      method: 'SELF',
      recordedBy: req.user!.id,
    },
    include: includeEmp,
  });
  return res.status(201).json({
    success: true,
    message: 'Presensi tercatat',
    data: {
      record,
      serverTime: now.toISOString(),
      deadline: env.apelDeadline,
      late: status === 'TERLAMBAT',
    },
    meta: null,
    errors: null,
  });
});

// ---------- POST /attendances (verifier input untuk orang lain / backdate) ----------
router.post('/', requirePermission('attendance.manage'), async (req, res) => {
  const schema = z.object({
    employeeId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(STATUS),
    checkInTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  if (b.date > todayYMD()) return fail(res, 422, 'Tidak boleh mencatat tanggal masa depan');
  const employee = await prisma.employee.findUnique({ where: { id: b.employeeId } });
  if (!employee) return fail(res, 404, 'Employee tidak ditemukan');

  const needsTime = PRESENCE.includes(b.status);
  if (needsTime && !b.checkInTime) return fail(res, 422, 'checkInTime (HH:MM) wajib untuk HADIR/TERLAMBAT');
  if (!needsTime && b.checkInTime) return fail(res, 422, 'checkInTime hanya untuk HADIR/TERLAMBAT');

  const date = parseYMD(b.date)!;
  const exists = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: b.employeeId, date } },
  });
  if (exists) return fail(res, 409, 'Sudah ada catatan tanggal tersebut (gunakan PATCH)');

  const record = await prisma.attendance.create({
    data: {
      employeeId: b.employeeId,
      date,
      checkInAt: needsTime ? checkInUTC(b.date, b.checkInTime!) : null,
      status: b.status,
      method: 'MANUAL',
      note: b.note,
      recordedBy: req.user!.id,
    },
    include: includeEmp,
  });
  return res.status(201).json({ success: true, message: 'Presensi dicatat', data: record, meta: null, errors: null });
});

// ---------- PATCH /attendances/:id (koreksi verifier) ----------
router.patch('/:id', requirePermission('attendance.manage'), async (req, res) => {
  const cur = await prisma.attendance.findUnique({ where: { id: req.params.id } });
  if (!cur) return fail(res, 404, 'Presensi tidak ditemukan');
  const schema = z.object({
    status: z.enum(STATUS).optional(),
    checkInTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const finalStatus = b.status ?? cur.status;
  const needsTime = PRESENCE.includes(finalStatus);
  let checkInAt: Date | null | undefined;
  if (needsTime) {
    if (b.checkInTime) checkInAt = checkInUTC(cur.date.toISOString().slice(0, 10), b.checkInTime);
    else if (!cur.checkInAt) return fail(res, 422, 'checkInTime wajib (catatan ini belum punya jam)');
  } else {
    checkInAt = null;
  }

  const updated = await prisma.attendance.update({
    where: { id: cur.id },
    data: {
      status: finalStatus,
      ...(checkInAt !== undefined ? { checkInAt } : {}),
      ...(b.note !== undefined ? { note: b.note } : {}),
    },
    include: includeEmp,
  });
  return ok(res, updated, 'Presensi dikoreksi');
});

// ---------- GET /attendances/today (status apel saya hari ini) ----------
router.get('/today', requirePermission('attendance.view'), async (req, res) => {
  const now = new Date();
  const dateStr = todayYMD(now);
  let record = null;
  if (req.user!.employeeId) {
    record = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: req.user!.employeeId, date: parseYMD(dateStr)! } },
      include: includeEmp,
    });
  }
  return ok(res, {
    record,
    serverTime: now.toISOString(),
    makassarTime: makassarParts(now),
    deadline: env.apelDeadline,
  });
});

// ---------- POST /attendances/check-out (presensi pulang hari ini) ----------
router.post('/check-out', requirePermission('attendance.checkin'), async (req, res) => {
  const employeeId = req.user!.employeeId;
  if (!employeeId) return fail(res, 422, 'User ini tidak terhubung ke data employee');
  const now = new Date();
  const record = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: parseYMD(todayYMD(now))! } },
  });
  if (!record || !record.checkInAt) return fail(res, 404, 'Belum presensi masuk hari ini');
  if (record.checkOutAt) return fail(res, 409, 'Sudah presensi pulang hari ini');

  const required = isFridayWita(now) ? env.checkoutFriday : env.checkoutWeekday;
  const early = makassarParts(now).minutes < deadlineMinutes(required);
  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: { checkOutAt: now },
    include: includeEmp,
  });
  return ok(res, {
    record: updated,
    serverTime: now.toISOString(),
    requiredCheckout: required,
    early,
  }, early ? 'Presensi pulang tercatat (pulang cepat)' : 'Presensi pulang tercatat');
});

// ---------- GET /attendances/report (format tabel presensi) ----------
// Kolom: nomor, nama, nip, gol, jabatan, jamHadir, jamPulang, status
router.get('/report', requirePermission('attendance.view'), async (req, res) => {
  const { date } = req.query as any;
  const dateStr = date ?? todayYMD();
  const dateObj = parseYMD(dateStr);
  if (!dateObj) return fail(res, 422, 'date tidak valid (YYYY-MM-DD)');

  const empWhere: any = { isActive: true };
  if (req.user!.role === 'EMPLOYEE') {
    if (!req.user!.employeeId) return fail(res, 422, 'User tidak terhubung ke employee');
    empWhere.id = req.user!.employeeId;
  }
  const [employees, records] = await Promise.all([
    prisma.employee.findMany({ where: empWhere, orderBy: { name: 'asc' } }),
    prisma.attendance.findMany({
      where: { date: dateObj, employee: empWhere },
    }),
  ]);
  const byEmp: Record<string, any> = {};
  for (const r of records) byEmp[r.employeeId] = r;
  const rows = employees.map((e, i) => {
    const r = byEmp[e.id];
    return {
      nomor: i + 1,
      nama: e.name,
      nip: e.nip,
      gol: e.rank,
      jabatan: e.position,
      jamHadir: hhmmWita(r?.checkInAt ?? null),
      jamPulang: hhmmWita(r?.checkOutAt ?? null),
      status: r?.status ?? '-',
    };
  });
  return ok(res, rows, 'ok', { date: dateStr });
});

// Absen = hari kerja Senin–Jumat tanpa HADIR/TERLAMBAT.
// IZIN/SAKIT resmi tidak dihitung absen. >= 5 hari dalam sepekan = bermasalah.
async function problematicOfWeek(weekStart: string) {
  const days = workdaysOfWeek(weekStart);
  const from = parseYMD(days[0])!;
  const to = parseYMD(days[4])!;
  const employees = await prisma.employee.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const records = await prisma.attendance.findMany({
    where: { date: { gte: from, lte: to } },
  });
  const present: Record<string, Set<string>> = {};
  const excused: Record<string, Set<string>> = {};
  for (const r of records) {
    const ymd = r.date.toISOString().slice(0, 10);
    if (['HADIR', 'TERLAMBAT'].includes(r.status)) {
      (present[r.employeeId] ??= new Set()).add(ymd);
    } else if (['IZIN', 'SAKIT'].includes(r.status)) {
      (excused[r.employeeId] ??= new Set()).add(ymd);
    }
  }
  return employees
    .map((e) => {
      const absentDates = days.filter(
        (d) => !present[e.id]?.has(d) && !excused[e.id]?.has(d),
      );
      return { employee: e, absenceCount: absentDates.length, absentDates };
    })
    .filter((x) => x.absenceCount >= 5)
    .map((x) => ({
      employee: { id: x.employee.id, nip: x.employee.nip, name: x.employee.name, position: x.employee.position },
      weekStart: days[0],
      weekEnd: days[4],
      absenceCount: x.absenceCount,
      absentDates: x.absentDates,
    }));
}

function assertMonday(weekStart: string): boolean {
  const d = parseYMD(weekStart);
  return !!d && new Date(weekStart + 'T00:00:00Z').getUTCDay() === 1;
}

// ---------- GET /attendances/problematic ----------
router.get('/problematic', requirePermission('attendance.summary'), async (req, res) => {
  const { weekStart } = req.query as any;
  if (!weekStart || !assertMonday(weekStart)) {
    return fail(res, 422, 'weekStart wajib tanggal Senin (YYYY-MM-DD)');
  }
  return ok(res, await problematicOfWeek(weekStart));
});

// ---------- POST /attendances/warning-letters/generate ----------
router.post('/warning-letters/generate', requirePermission('attendance.manage'), async (req, res) => {
  const schema = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !assertMonday(parsed.data.weekStart)) {
    return fail(res, 422, 'weekStart wajib tanggal Senin (YYYY-MM-DD)');
  }
  const items = await problematicOfWeek(parsed.data.weekStart);
  const result = [];
  for (const it of items) {
    const existed = await prisma.warningLetter.findUnique({
      where: { employeeId_weekStart: { employeeId: it.employee.id, weekStart: parseYMD(it.weekStart)! } },
    });
    if (existed) {
      result.push({ ...existed, created: false });
      continue;
    }
    const count = await prisma.warningLetter.count();
    const letterNumber = `TEGURAN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const content =
      `SURAT TEGURAN (DUMMY) Nomor: ${letterNumber}\n` +
      `Kepada Yth. Sdr/i ${it.employee.name} (${it.employee.position})\n` +
      `Berdasarkan data presensi apel periode ${it.weekStart} s.d. ${it.weekEnd}, ` +
      `Saudara tercatat tidak hadir sebanyak ${it.absenceCount} hari kerja ` +
      `(${it.absentDates.join(', ')}) tanpa keterangan resmi, sehingga masuk kategori pegawai bermasalah. ` +
      `Diminta memperbaiki kedisiplinan kehadiran. [Dokumen dummy untuk demo.]`;
    const created = await prisma.warningLetter.create({
      data: {
        letterNumber,
        employeeId: it.employee.id,
        weekStart: parseYMD(it.weekStart)!,
        weekEnd: parseYMD(it.weekEnd)!,
        absenceCount: it.absenceCount,
        content,
        createdBy: req.user!.id,
      },
    });
    result.push({ ...created, created: true });
  }
  return ok(res, result, `${result.filter((r: any) => r.created).length} surat dibuat, ${result.length} pegawai bermasalah`);
});

// ---------- GET /attendances/warning-letters ----------
router.get('/warning-letters', requirePermission('attendance.summary'), async (req, res) => {
  const { page = '1', limit = '10' } = req.query as any;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.warningLetter.count(),
    prisma.warningLetter.findMany({
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- GET /attendances/warning-letters/:id ----------
router.get('/warning-letters/:id', requirePermission('attendance.summary'), async (req, res) => {
  const w = await prisma.warningLetter.findUnique({
    where: { id: req.params.id },
    include: { employee: true },
  });
  if (!w) return fail(res, 404, 'Surat teguran tidak ditemukan');
  return ok(res, w);
});
// ---------- GET /attendances/summary (rekap per pegawai) ----------
router.get('/summary', requirePermission('attendance.summary'), async (req, res) => {
  const { from, to, orgUnit } = req.query as any;
  const toStr = to ?? todayYMD();
  const fromStr = from ?? toStr.slice(0, 7) + '-01';
  const fromDate = parseYMD(fromStr);
  const toDate = parseYMD(toStr);
  if (!fromDate || !toDate || toDate < fromDate) return fail(res, 422, 'Rentang tanggal tidak valid');

  const empWhere: any = { isActive: true };
  if (orgUnit) empWhere.orgUnit = { code: String(orgUnit) };

  const [employees, groups] = await Promise.all([
    prisma.employee.findMany({ where: empWhere, include: { orgUnit: true }, orderBy: { name: 'asc' } }),
    prisma.attendance.groupBy({
      by: ['employeeId', 'status'],
      where: { date: { gte: fromDate, lte: toDate }, employee: empWhere },
      _count: { _all: true },
    }),
  ]);
  const byEmp: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    byEmp[g.employeeId] ??= {};
    byEmp[g.employeeId][g.status] = g._count._all;
  }
  const items = employees.map((e) => {
    const c = byEmp[e.id] ?? {};
    const recorded = Object.values(c).reduce((a, b) => a + b, 0);
    return {
      employee: { id: e.id, nip: e.nip, name: e.name, position: e.position, orgUnit: e.orgUnit.code },
      counts: { HADIR: c.HADIR ?? 0, TERLAMBAT: c.TERLAMBAT ?? 0, IZIN: c.IZIN ?? 0, SAKIT: c.SAKIT ?? 0, ALPA: c.ALPA ?? 0 },
      recorded,
    };
  });
  return ok(res, items, 'ok', { from: fromStr, to: toStr, totalEmployees: employees.length });
});

// ---------- GET /attendances (daftar) ----------
router.get('/', requirePermission('attendance.view'), async (req, res) => {
  const { from, to, status, employeeId, orgUnit, page = '1', limit = '31' } = req.query as any;
  const toStr = to ?? todayYMD();
  const fromStr = from ?? toStr.slice(0, 7) + '-01';
  const fromDate = parseYMD(fromStr);
  const toDate = parseYMD(toStr);
  if (!fromDate || !toDate || toDate < fromDate) return fail(res, 422, 'Rentang tanggal tidak valid');

  const where: any = { date: { gte: fromDate, lte: toDate } };
  if (status) {
    if (!STATUS.includes(status)) return fail(res, 422, 'status tidak valid');
    where.status = status;
  }
  if (req.user!.role === 'EMPLOYEE') {
    if (!req.user!.employeeId) return fail(res, 422, 'User tidak terhubung ke employee');
    where.employeeId = req.user!.employeeId;
  } else {
    if (employeeId) where.employeeId = String(employeeId);
    if (orgUnit) where.employee = { orgUnit: { code: String(orgUnit) } };
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 31);
  const [total, items] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      include: includeEmp,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

export default router;
