import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authRequired, requirePermission } from '../middleware/auth';
import { ok, fail } from '../utils/response';
import { usersForPermission } from '../lib/permissions';
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

fs.mkdirSync(env.uploadDir, { recursive: true });
const photoUpload = multer({
  dest: env.uploadDir,
  limits: { fileSize: env.maxFileBytes },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype));
  },
});

const STATUS = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'DL', 'ALPA'] as const;
// ALPA = TK (Tanpa Keterangan, spec). DL = Dinas Luar (memaafkan kedua sesi).
const PRESENCE = ['HADIR', 'TERLAMBAT'];
const EXCUSED_FULL = ['IZIN', 'SAKIT', 'DL'];

const includeEmp = {
  employee: { include: { orgUnit: true } },
};

// Hari yang sudah dikunci Kasubag ("Simpan & Validasi") tidak bisa diubah lagi.
async function dayLocked(date: Date): Promise<boolean> {
  const lock = await prisma.attendanceLock.findUnique({ where: { date } });
  return !!lock;
}

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
  if (await dayLocked(date)) return fail(res, 409, 'Presensi hari ini sudah dikunci Kasubag');

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
  if (await dayLocked(date)) return fail(res, 409, 'Tanggal tersebut sudah dikunci Kasubag');
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
  if (await dayLocked(cur.date)) return fail(res, 409, 'Tanggal tersebut sudah dikunci Kasubag');
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
  if (await dayLocked(record.date)) return fail(res, 409, 'Presensi hari ini sudah dikunci Kasubag');

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
  return ok(res, rows, 'ok', { date: dateStr, locked: !!(await prisma.attendanceLock.findUnique({ where: { date: dateObj } })) });
});

// ---------- POST /attendances/lock (Kasubag: Simpan & Validasi → kunci harian) ----------
// Syarat: foto PAGI + SORE sudah diunggah. Pegawai aktif tanpa catatan
// dimaterialisasi sebagai ALPA (=TK). Hanya position KASUBAG (superadmin bypass).
router.post('/lock', requirePermission('attendance.manage'), async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && !(req.user!.position ?? '').startsWith('KASUBAG')) {
    return fail(res, 403, 'Penguncian harian hanya oleh Kasubag');
  }
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  if (parsed.data.date > todayYMD()) return fail(res, 422, 'Tidak boleh mengunci tanggal masa depan');
  const date = parseYMD(parsed.data.date)!;
  if (await dayLocked(date)) return fail(res, 409, 'Tanggal tersebut sudah dikunci');

  const photos = await prisma.attendanceSessionPhoto.findMany({ where: { date }, select: { session: true } });
  const sessions = new Set(photos.map((p) => p.session));
  const missing = ['PAGI', 'SORE'].filter((s) => !sessions.has(s));
  if (missing.length) {
    return fail(res, 422, `Foto belum lengkap, kurang sesi: ${missing.join(', ')}`);
  }

  const employees = await prisma.employee.findMany({ where: { isActive: true }, select: { id: true } });
  const records = await prisma.attendance.findMany({ where: { date }, select: { employeeId: true } });
  const recorded = new Set(records.map((r) => r.employeeId));
  const absent = employees.filter((e) => !recorded.has(e.id));

  await prisma.$transaction(async (tx) => {
    if (absent.length) {
      await tx.attendance.createMany({
        data: absent.map((e) => ({
          employeeId: e.id,
          date,
          status: 'ALPA',
          method: 'SYSTEM',
          note: 'Otomatis: tanpa presensi saat penguncian harian',
          recordedBy: req.user!.id,
        })),
      });
    }
    await tx.attendanceLock.create({
      data: { date, lockedBy: req.user!.id, note: parsed.data.note ?? null },
    });
  });
  return ok(res, { date: parsed.data.date, locked: true, materializedTK: absent.length }, 'Harian dikunci');
});

// ---------- GET /attendances/weekly-recap (Rekapitulasi Daftar Hadir Per Pekan) ----------
// Matriks semua pegawai × 5 hari kerja {pagi, sore} + total TK + flag bermasalah.
router.get('/weekly-recap', requirePermission('attendance.summary'), async (req, res) => {
  const { weekStart } = req.query as any;
  if (!weekStart || !assertMonday(weekStart)) {
    return fail(res, 422, 'weekStart wajib tanggal Senin (YYYY-MM-DD)');
  }
  const days = workdaysOfWeek(weekStart);
  const rows = (await weekMatrix(weekStart)).map((x, i) => {
    const sessions = x.dayRows.flatMap((d) => [d.pagi, d.sore]);
    const count = (v: string) => sessions.filter((s) => s === v).length;
    const tk = count('ABSEN');
    const izin = count('IZIN');
    const dl = count('DL');
    return {
      no: i + 1,
      employee: {
        id: x.employee.id, nip: x.employee.nip, name: x.employee.name,
        position: x.employee.position, rank: x.employee.rank ?? null,
        employmentStatus: x.employee.employmentStatus,
        orgUnit: { code: x.employee.orgUnit?.code ?? null, name: x.employee.orgUnit?.name ?? null },
      },
      // Kolom tabel rekap: kantor, jabatan, status kepegawaian, TK, izin, DL, rekapitulasi.
      kantor: x.employee.orgUnit?.name ?? '-',
      jabatan: x.employee.position,
      status: x.employee.employmentStatus,
      tk,
      izin,
      dl,
      rekapitulasi: tk + izin + dl,
      counts: {
        hadir: count('HADIR'), terlambat: count('TERLAMBAT'),
        izin, sakit: count('SAKIT'), dl, tk,
      },
      weekStart: days[0],
      weekEnd: days[4],
      absenceCount: x.absenceCount,
      isProblematic: x.absenceCount >= 5,
      days: x.dayRows,
    };
  });
  return ok(res, rows, 'ok', {
    weekStart: days[0],
    weekEnd: days[4],
    totalEmployees: rows.length,
    problematic: rows.filter((r) => r.isProblematic).length,
  });
});

// 1 hari kerja = 2 sesi (PAGI apel masuk, SORE apel pulang). 1 sesi tak hadir = 1 ketidakhadiran.
// IZIN/SAKIT/DL sehari penuh memaafkan kedua sesi. >= 5 sesi dalam sepekan = bermasalah.
type SessionVal = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'DL' | 'ABSEN';
// Matriks kehadiran 1 pekan (Senin–Jumat) untuk semua pegawai aktif.
async function weekMatrix(weekStart: string) {
  const days = workdaysOfWeek(weekStart);
  const from = parseYMD(days[0])!;
  const to = parseYMD(days[4])!;
  const employees = await prisma.employee.findMany({ where: { isActive: true }, include: { orgUnit: true }, orderBy: { name: 'asc' } });
  const records = await prisma.attendance.findMany({
    where: { date: { gte: from, lte: to } },
  });
  const byEmpDay: Record<string, any> = {};
  for (const r of records) {
    byEmpDay[`${r.employeeId}|${r.date.toISOString().slice(0, 10)}`] = r;
  }
  return employees
    .map((e) => {
      const dayRows = days.map((d) => {
        const r = byEmpDay[`${e.id}|${d}`];
        let pagi: SessionVal = 'ABSEN';
        let sore: SessionVal = 'ABSEN';
        if (r) {
          if (r.status === 'HADIR' || r.status === 'TERLAMBAT') {
            pagi = r.status;
            sore = r.checkOutAt ? 'HADIR' : 'ABSEN';
          } else if (r.status === 'IZIN' || r.status === 'SAKIT' || r.status === 'DL') {
            pagi = r.status as SessionVal;
            sore = r.status as SessionVal;
          }
        }
        return { date: d, pagi, sore };
      });
      const absenceCount = dayRows.filter((x) => x.pagi === 'ABSEN').length
        + dayRows.filter((x) => x.sore === 'ABSEN').length;
      return { employee: e, absenceCount, dayRows };
    });
}

async function problematicOfWeek(weekStart: string) {
  const days = workdaysOfWeek(weekStart);
  return (await weekMatrix(weekStart))
    .filter((x) => x.absenceCount >= 5)
    .map((x) => ({
      employee: { id: x.employee.id, nip: x.employee.nip, name: x.employee.name, position: x.employee.position },
      weekStart: days[0],
      weekEnd: days[4],
      absenceCount: x.absenceCount,
      days: x.dayRows,
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
async function notifyAttendance(userIds: string[], title: string, body: string, referenceId?: string | null) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: 'ATTENDANCE',
        title,
        body,
        referenceType: 'warning_letter',
        referenceId: referenceId ?? null,
      })),
    });
  } catch (e) {
    console.error('notify presensi gagal:', (e as Error).message);
  }
}

async function userIdsByPosition(pos: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { position: pos, isActive: true }, select: { id: true } });
  return users.map((u) => u.id);
}

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
    const emp = await prisma.employee.findUnique({
      where: { id: it.employee.id },
      include: { orgUnit: true },
    });
    const rincian = it.days
      .filter((d: any) => d.pagi === 'ABSEN' || d.sore === 'ABSEN')
      .map((d: any) => `${d.date} (pagi ${d.pagi}, sore ${d.sore})`)
      .join('; ');
    const content =
      `SURAT TEGURAN Nomor: ${letterNumber}\n` +
      `Kepada Yth. Sdr/i ${emp?.name ?? it.employee.name}\n` +
      `NIP: ${emp?.nip ?? '-'}\n` +
      `Jabatan: ${emp?.position ?? it.employee.position} / Unit: ${emp?.orgUnit?.name ?? '-'}\n` +
      `Berdasarkan rekapitulasi presensi apel periode ${it.weekStart} s.d. ${it.weekEnd}, ` +
      `Saudara tercatat tidak hadir sebanyak ${it.absenceCount} sesi apel ` +
      `tanpa keterangan resmi${rincian ? ` dengan rincian: ${rincian}` : ''}, ` +
      `sehingga masuk kategori Pegawai Bermasalah. ` +
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
    // Alert otomatis ke Sekcam + Kasubag (Fase 3).
    const recipients = [...await userIdsByPosition('SEKCAM'), ...await usersForPermission('attendance.summary')]
      .filter((id) => id !== req.user!.id);
    await notifyAttendance(
      recipients,
      `Pegawai bermasalah: ${emp?.name ?? it.employee.name}`,
      `${it.absenceCount} sesi apel tanpa keterangan (${it.weekStart}–${it.weekEnd}). Surat: ${letterNumber}.`,
      created.id,
    );
  }
  return ok(res, result, `${result.filter((r: any) => r.created).length} surat dibuat, ${result.length} pegawai bermasalah`);
});

// ---------- GET /attendances/warning-letters ----------
router.get('/warning-letters', requirePermission('attendance.summary'), async (req, res) => {
  const { page = '1', limit = '10', followUp } = req.query as any;
  const where: any = {};
  if (followUp) {
    if (!['NONE', 'BKPSDM'].includes(followUp)) return fail(res, 422, 'followUp tidak valid (NONE|BKPSDM)');
    where.coachingFollowUp = followUp;
  }
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 10);
  const [total, items] = await Promise.all([
    prisma.warningLetter.count({ where }),
    prisma.warningLetter.findMany({
      where,
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- GET /attendances/warning-letters/:id/print (payload cetak/laporan BKPSDM) ----------
// (Didefinisikan SEBELUM /:id agar tidak tertangkap param generik.)
router.get('/warning-letters/:id/print', requirePermission('attendance.summary'), async (req, res) => {
  const w = await prisma.warningLetter.findUnique({
    where: { id: req.params.id },
    include: { employee: { include: { orgUnit: true } } },
  });
  if (!w) return fail(res, 404, 'Surat teguran tidak ditemukan');
  const officials = await prisma.user.findMany({
    where: { isActive: true, OR: [{ position: 'CAMAT' }, { position: 'SEKCAM' }, { position: { startsWith: 'KASUBAG' } }] },
    include: { employee: true },
    orderBy: { createdAt: 'asc' },
  });
  const official = (pos: string) => {
    const u = officials.find((x) => (x.position ?? '').startsWith(pos));
    return u ? { name: u.employee?.name ?? u.username, nip: u.employee?.nip ?? null, position: u.position } : null;
  };
  const statusPembinaan = !w.summonScheduledAt ? 'Menunggu' : !w.coachedAt ? 'Diproses' : 'Selesai';
  return ok(res, {
    letterNumber: w.letterNumber,
    weekStart: w.weekStart.toISOString().slice(0, 10),
    weekEnd: w.weekEnd.toISOString().slice(0, 10),
    absenceCount: w.absenceCount,
    employee: {
      name: w.employee.name, nip: w.employee.nip, position: w.employee.position,
      rank: w.employee.rank, unit: w.employee.orgUnit?.name ?? null,
    },
    summon: w.summonScheduledAt ? { scheduledAt: w.summonScheduledAt, note: w.summonNote } : null,
    coaching: w.coachedAt ? { result: w.coachingResult, followUp: w.coachingFollowUp, coachedAt: w.coachedAt } : null,
    escalation: {
      forward: w.forwardAt ? { by: w.forwardBy, at: w.forwardAt, note: w.forwardNote } : null,
      instruction: w.instructedAt ? { by: w.instructedBy, at: w.instructedAt, text: w.instruction } : null,
    },
    officials: { camat: official('CAMAT'), sekcam: official('SEKCAM'), kasubag: official('KASUBAG') },
    statusPembinaan,
    content: w.content,
  });
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

// ---------- POST /attendances/warning-letters/:id/summon (surat panggilan) ----------
router.post('/warning-letters/:id/summon', requirePermission('attendance.manage'), async (req, res) => {
  const schema = z.object({
    scheduledAt: z.string().datetime({ offset: true }),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const w = await prisma.warningLetter.findUnique({ where: { id: req.params.id } });
  if (!w) return fail(res, 404, 'Surat teguran tidak ditemukan');
  const updated = await prisma.warningLetter.update({
    where: { id: w.id },
    data: { summonScheduledAt: new Date(parsed.data.scheduledAt), summonNote: parsed.data.note ?? null },
  });
  // Beritahu pegawai yang dipanggil.
  const pegawaiUser = await prisma.user.findFirst({
    where: { employeeId: w.employeeId, isActive: true },
    select: { id: true },
  });
  if (pegawaiUser && pegawaiUser.id !== req.user!.id) {
    await notifyAttendance(
      [pegawaiUser.id],
      `Panggilan pembinaan: ${w.letterNumber}`,
      `Anda dijadwalkan pembinaan pada ${parsed.data.scheduledAt}${parsed.data.note ? ` — ${parsed.data.note}` : ''}.`,
      w.id,
    );
  }
  return ok(res, updated, 'Panggilan pembinaan dijadwalkan');
});

// ---------- POST /attendances/warning-letters/:id/forward (Sekcam teruskan ke Camat) ----------
router.post('/warning-letters/:id/forward', requirePermission('attendance.forward'), async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.position !== 'SEKCAM') {
    return fail(res, 403, 'Penerusan ke Camat hanya oleh Sekcam');
  }
  const schema = z.object({ note: z.string().max(500).optional() });
  const note = schema.safeParse(req.body ?? {}).data?.note ?? null;
  const w = await prisma.warningLetter.findUnique({ where: { id: req.params.id }, include: { employee: true } });
  if (!w) return fail(res, 404, 'Surat teguran tidak ditemukan');
  const updated = await prisma.warningLetter.update({
    where: { id: w.id },
    data: { forwardBy: req.user!.id, forwardAt: new Date(), forwardNote: note },
  });
  const camatIds = (await userIdsByPosition('CAMAT')).filter((id) => id !== req.user!.id);
  await notifyAttendance(
    camatIds,
    `Eskalasi pegawai bermasalah: ${w.employee.name}`,
    `Sekcam meneruskan laporan ${w.letterNumber} (${w.absenceCount} sesi TK)${note ? ` — ${note}` : ''}.`,
    w.id,
  );
  return ok(res, updated, 'Laporan diteruskan ke Camat');
});

// ---------- POST /attendances/warning-letters/:id/instruct (Camat: Tindak Lanjuti) ----------
router.post('/warning-letters/:id/instruct', requirePermission('attendance.forward'), async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.position !== 'CAMAT') {
    return fail(res, 403, 'Instruksi tindak lanjut hanya oleh Camat');
  }
  const schema = z.object({ instruction: z.string().min(5, 'Instruksi wajib diisi') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const w = await prisma.warningLetter.findUnique({ where: { id: req.params.id }, include: { employee: true } });
  if (!w) return fail(res, 404, 'Surat teguran tidak ditemukan');
  const updated = await prisma.warningLetter.update({
    where: { id: w.id },
    data: { instructedBy: req.user!.id, instructedAt: new Date(), instruction: parsed.data.instruction },
  });
  const executors = (await usersForPermission('attendance.manage')).filter((id) => id !== req.user!.id);
  await notifyAttendance(
    executors,
    `Instruksi Camat: ${w.letterNumber}`,
    `${parsed.data.instruction} (pegawai: ${w.employee.name}).`,
    w.id,
  );
  return ok(res, updated, 'Instruksi Camat dicatat');
});

// ---------- PATCH /attendances/warning-letters/:id/coaching (hasil pembinaan) ----------
router.patch('/warning-letters/:id/coaching', requirePermission('attendance.manage'), async (req, res) => {
  const schema = z.object({
    result: z.string().min(5, 'Hasil pembinaan wajib diisi'),
    followUp: z.enum(['NONE', 'BKPSDM']),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const w = await prisma.warningLetter.findUnique({ where: { id: req.params.id } });
  if (!w) return fail(res, 404, 'Surat teguran tidak ditemukan');
  if (!w.summonScheduledAt) return fail(res, 422, 'Buat surat panggilan dulu (summon)');
  const updated = await prisma.warningLetter.update({
    where: { id: w.id },
    data: {
      coachingResult: parsed.data.result,
      coachingFollowUp: parsed.data.followUp,
      summonNote: parsed.data.note ?? w.summonNote,
      coachedAt: new Date(),
    },
  });
  return ok(res, updated, 'Hasil pembinaan dicatat');
});

// ---------- POST /attendances/session-photos (foto dokumentasi apel per sesi) ----------
router.post('/session-photos', requirePermission('attendance.manage'), (req, res) => {
  photoUpload.single('file')(req as any, res as any, async (err: any) => {
    if (err) return fail(res, 400, err.message);
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      session: z.enum(['PAGI', 'SORE']),
    });
    const parsed = schema.safeParse(req.body);
    const file = (req as any).file;
    if (!parsed.success) {
      if (file) fs.rmSync(file.path, { force: true });
      return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
    }
    if (!file) return fail(res, 422, 'file wajib (jpg/png, max 5MB)');
    if (!parseYMD(parsed.data.date)) return fail(res, 422, 'date tidak valid');
    const exists = await prisma.attendanceSessionPhoto.findUnique({
      where: { date_session: { date: parseYMD(parsed.data.date)!, session: parsed.data.session } },
    });
    if (exists) {
      fs.rmSync(file.path, { force: true });
      return fail(res, 409, 'Foto sesi ini sudah ada');
    }
    const ext = path.extname(file.originalname);
    const storedPath = file.path + ext;
    fs.renameSync(file.path, storedPath);
    const photo = await prisma.attendanceSessionPhoto.create({
      data: {
        date: parseYMD(parsed.data.date)!,
        session: parsed.data.session,
        originalName: file.originalname,
        storedPath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: req.user!.id,
      },
    });
    return res.status(201).json({
      success: true,
      message: 'Foto sesi diupload',
      data: { ...photo, photoUrl: `/api/v1/attendances/session-photos/${photo.id}/file` },
      meta: null,
      errors: null,
    });
  });
});

// ---------- GET /attendances/session-photos ----------
router.get('/session-photos', requirePermission('attendance.view'), async (req, res) => {
  const { from, to } = req.query as any;
  const where: any = {};
  if (from || to) {
    where.date = {};
    if (from) {
      if (!parseYMD(from)) return fail(res, 422, 'from tidak valid');
      where.date.gte = parseYMD(from);
    }
    if (to) {
      if (!parseYMD(to)) return fail(res, 422, 'to tidak valid');
      where.date.lte = parseYMD(to);
    }
  }
  const items = await prisma.attendanceSessionPhoto.findMany({
    where,
    orderBy: [{ date: 'desc' }, { session: 'asc' }],
    take: 200,
  });
  return ok(res, items.map((p) => ({
    ...p,
    photoUrl: `/api/v1/attendances/session-photos/${p.id}/file`,
  })));
});

// ---------- GET /attendances/session-photos/:id/file ----------
router.get('/session-photos/:id/file', requirePermission('attendance.view'), async (req, res) => {
  const p = await prisma.attendanceSessionPhoto.findUnique({ where: { id: req.params.id } });
  if (!p || !fs.existsSync(p.storedPath)) return fail(res, 404, 'Foto tidak ditemukan');
  return res.download(p.storedPath, p.originalName);
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
  const items = employees.map((e, i) => {
    const c = byEmp[e.id] ?? {};
    const recorded = Object.values(c).reduce((a, b) => a + b, 0);
    const tk = c.ALPA ?? 0;
    const izin = c.IZIN ?? 0;
    const dl = c.DL ?? 0;
    return {
      no: i + 1,
      employee: { id: e.id, nip: e.nip, name: e.name, position: e.position, orgUnit: e.orgUnit.code },
      kantor: e.orgUnit.name,
      counts: { HADIR: c.HADIR ?? 0, TERLAMBAT: c.TERLAMBAT ?? 0, IZIN: izin, SAKIT: c.SAKIT ?? 0, DL: dl, ALPA: tk },
      rekapitulasi: tk + izin + dl,
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
