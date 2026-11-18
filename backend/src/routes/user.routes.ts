import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authRequired, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../utils/response';
import {
  fullYearsBetween,
  normalizeRank,
  PNS_SALARY_SCALE,
  salaryAt,
} from '../services/pns-salary';
import {
  defaultPositionForRole,
  positionPermissionPolicy,
} from '../lib/role-grants';

const router = Router();
router.use(authRequired);

const includeRef = {
  employee: { include: { orgUnit: true } },
  orgUnit: true,
};

const actingPositionSchema = z.object({
  position: z.string().min(1).max(50),
  userId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  reason: z.string().max(255).optional(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z
  .string()
  .trim()
  .regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD')
  .refine((value) => toDate(value) !== null, 'Tanggal tidak valid');
const optionalDate = z.union([dateField, z.null()]).optional();

const emailField = z
  .string()
  .trim()
  .max(150, 'Email maksimal 150 karakter')
  .refine(
    (value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    'Format email tidak valid',
  );
const phoneField = z
  .string()
  .trim()
  .max(20, 'Nomor telepon maksimal 20 karakter')
  .refine(
    (value) => value === '' || /^[0-9+()\s.-]+$/.test(value),
    'Nomor telepon hanya boleh berisi angka, spasi, +, -, titik, atau tanda kurung',
  );

const profileUpdateSchema = z.object({
  email: z.union([emailField, z.null()]).optional(),
  phone: z.union([phoneField, z.null()]).optional(),
});

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,49}$/,
    'Username 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung',
  );
const passwordSchema = z.string().min(8, 'Kata sandi minimal 8 karakter').max(72);
const roleSchema = z.enum(['SUPER_ADMIN', 'VERIFIER', 'SUPERVISOR', 'LEADER', 'EMPLOYEE']);
const positionSchema = z.string().trim().min(1).max(50);

const employeeFields = {
  name: z.string().trim().min(2).max(150),
  nip: z.string().trim().max(30).optional().nullable(),
  employeeNumber: z.string().trim().max(30).optional().nullable(),
  gender: z.enum(['L', 'P']),
  birthPlace: z.string().trim().max(100).optional().nullable(),
  birthDate: optionalDate,
  employmentStatus: z.enum(['PNS', 'PPPK', 'HONORER']),
  position: positionSchema.optional(),
  rank: z.string().trim().max(20).optional().nullable(),
  rankTmt: optionalDate,
  joinDate: optionalDate,
  salary: z.number().int().nonnegative().optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  isActive: z.boolean().optional(),
};

const employeeCreateSchema = z.object({
  ...employeeFields,
  gender: employeeFields.gender.default('L'),
  employmentStatus: employeeFields.employmentStatus.default('PNS'),
});

// Jangan memakai .partial() pada schema create: default gender/status bisa
// ikut terisi saat update dan menimpa data lama tanpa diminta.
const employeeUpdateSchema = z.object(employeeFields).partial();

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
  position: positionSchema.optional(),
  orgUnitCode: z.string().trim().min(1).max(20).default('KEC-TAMALATE'),
  isActive: z.boolean().optional(),
  employee: employeeCreateSchema,
});

const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  role: roleSchema.optional(),
  position: z.union([positionSchema, z.null()]).optional(),
  orgUnitCode: z.string().trim().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
  employee: employeeUpdateSchema.optional(),
});

const ROLE_OPTIONS = [
  {
    code: 'SUPER_ADMIN',
    label: 'Super Admin',
    description: 'Akses penuh, termasuk membuat dan menghapus akun.',
    defaultPosition: 'ADMIN',
  },
  {
    code: 'VERIFIER',
    label: 'Staf Kepegawaian (operator)',
    description: 'Pelaksana administrasi cuti, KGB, pensiun, surat, dan kenaikan pangkat.',
    defaultPosition: 'STAF_KEPEGAWAIAN',
  },
  {
    code: 'SUPERVISOR',
    label: 'Supervisor / Atasan Langsung',
    description: 'Pemeriksa dan pemberi pertimbangan. Jabatan Kasubag mendapat grant pemeriksa.',
    defaultPosition: 'KASUBAG',
  },
  {
    code: 'LEADER',
    label: 'Sekcam / Camat',
    description: 'Pejabat pemaraf dan penandatangan akhir sesuai jabatan.',
    defaultPosition: 'SEKCAM',
  },
  {
    code: 'EMPLOYEE',
    label: 'Pegawai',
    description: 'Mengajukan cuti, KGB, dan melihat usulan sendiri.',
    defaultPosition: 'STAF',
  },
] as const;

const POSITION_OPTIONS = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'STAF_KEPEGAWAIAN', label: 'Staf Kepegawaian' },
  { value: 'KASUBAG', label: 'Kasubag Umum & Kepegawaian' },
  { value: 'KASI', label: 'Kasi' },
  { value: 'SEKCAM', label: 'Sekretaris Camat' },
  { value: 'CAMAT', label: 'Camat' },
  { value: 'LURAH', label: 'Lurah' },
  { value: 'SEKLUR', label: 'Sekretaris Lurah' },
  { value: 'STAF', label: 'Staf' },
];

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Tolak tanggal yang “digulung” JavaScript, mis. 2026-02-31.
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function resolveSalary(
  rankInput: string | null | undefined,
  rankTmt: Date | null | undefined,
  joinDate: Date | null | undefined,
  fallback: number | null | undefined,
): number | null {
  const rank = normalizeRank(rankInput ?? null);
  const base = rankTmt ?? joinDate;
  if (!rank || !base) return fallback ?? null;
  const mkg = fullYearsBetween(base, new Date());
  return salaryAt(rank, mkg) ?? fallback ?? null;
}

async function nextEmployeeNumber(tx: any): Promise<string> {
  const rows: Array<{ employeeNumber: string }> = await tx.employee.findMany({
    where: { employeeNumber: { startsWith: 'EMP-' } },
    select: { employeeNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const match = /^EMP-(\d+)$/.exec(row.employeeNumber);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `EMP-${String(max + 1).padStart(3, '0')}`;
}

async function applyPositionPolicy(
  tx: any,
  userId: string,
  role: string,
  position: string | null,
): Promise<void> {
  await tx.userPermissionOverride.deleteMany({ where: { userId } });
  const policy = positionPermissionPolicy(role, position);
  if (!policy || (!policy.grant.length && !policy.deny.length)) return;

  const codes = [...policy.grant, ...policy.deny];
  const permissions = await tx.permission.findMany({ where: { code: { in: codes } } });
  const byCode = new Map<string, string>(
    permissions.map((permission: { code: string; id: string }) => [permission.code, permission.id]),
  );

  for (const code of policy.grant) {
    const permissionId = byCode.get(code);
    if (!permissionId) continue;
    await tx.userPermissionOverride.create({
      data: { userId, permissionId, effect: 'GRANT', reason: 'kebijakan jabatan' },
    });
  }
  for (const code of policy.deny) {
    const permissionId = byCode.get(code);
    if (!permissionId) continue;
    await tx.userPermissionOverride.create({
      data: { userId, permissionId, effect: 'DENY', reason: 'kebijakan jabatan' },
    });
  }
}

function uniqueConstraintMessage(error: unknown): string | null {
  if ((error as { code?: string } | null)?.code !== 'P2002') return null;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.join(', ') : typeof target === 'string' ? target : '';
  return fields
    ? `Data sudah dipakai: ${fields}. Gunakan nilai lain.`
    : 'Username, NIP, atau nomor pegawai sudah dipakai.';
}

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function profilePayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    omit: { passwordHash: true },
    include: includeRef,
  });
  if (!user) return null;
  const employee = user.employee;
  const orgUnit = user.orgUnit ?? employee?.orgUnit ?? null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    position: user.position,
    email: user.email ?? null,
    phone: employee?.phone ?? null,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    orgUnit: orgUnit ? { id: orgUnit.id, code: orgUnit.code, name: orgUnit.name } : null,
    employee: employee
      ? {
          id: employee.id,
          nip: employee.nip,
          employeeNumber: employee.employeeNumber,
          name: employee.name,
          gender: employee.gender,
          birthPlace: employee.birthPlace,
          birthDate: dateOnly(employee.birthDate),
          employmentStatus: employee.employmentStatus,
          position: employee.position,
          rank: employee.rank,
          rankTmt: dateOnly(employee.rankTmt),
          joinDate: dateOnly(employee.joinDate),
          phone: employee.phone,
          address: employee.address,
          isActive: employee.isActive,
          orgUnit: employee.orgUnit
            ? { id: employee.orgUnit.id, code: employee.orgUnit.code, name: employee.orgUnit.name }
            : null,
        }
      : null,
  };
}

// ---------- Profil akun sendiri ----------
// Semua user login boleh melihat profilnya. Hanya email dan nomor telepon
// yang dapat diubah sendiri; data kepegawaian tetap dikelola admin.
router.get('/me', async (req, res) => {
  const payload = await profilePayload(req.user!.id);
  if (!payload) return fail(res, 404, 'Akun tidak ditemukan');
  return ok(res, payload);
});

router.patch('/me', async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  if (b.email === undefined && b.phone === undefined) {
    return fail(res, 422, 'Isi minimal email atau nomor telepon');
  }

  const existing = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { employee: { select: { id: true } } },
  });
  if (!existing) return fail(res, 404, 'Akun tidak ditemukan');
  if (b.phone !== undefined && !existing.employeeId) {
    return fail(res, 422, 'Akun belum terhubung ke data pegawai');
  }

  await prisma.$transaction(async (tx) => {
    if (b.email !== undefined) {
      await tx.user.update({
        where: { id: existing.id },
        data: { email: textOrNull(b.email)?.toLowerCase() ?? null },
      });
    }
    if (b.phone !== undefined && existing.employeeId) {
      await tx.employee.update({
        where: { id: existing.employeeId },
        data: { phone: textOrNull(b.phone) },
      });
    }
  });

  const payload = await profilePayload(existing.id);
  return ok(res, payload, 'Profil diperbarui');
});

// ---------- GET /users ----------
router.get('/', requirePermission('user.view'), async (req, res) => {
  const { q, role, orgUnit, active, page = '1', limit = '20' } = req.query as any;
  const where: any = {};
  if (q) {
    const search = String(q).trim();
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { employee: { is: { name: { contains: search, mode: 'insensitive' } } } },
      { employee: { is: { nip: { contains: search, mode: 'insensitive' } } } },
      { employee: { is: { employeeNumber: { contains: search, mode: 'insensitive' } } } },
    ];
  }
  if (role) where.role = String(role);
  if (orgUnit) where.orgUnit = { code: String(orgUnit) };
  if (active !== undefined) where.isActive = active === 'true';
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 20);
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      omit: { passwordHash: true },
      include: includeRef,
      orderBy: { username: 'asc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- GET /users/options (manajemen pengguna) ----------
router.get('/options', requirePermission('user.manage'), async (_req, res) => {
  const orgUnits = await prisma.organizationalUnit.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true, type: true },
  });

  const rankMap = new Map<string, { rank: string; minMkg: number; maxMkg: number }>();
  for (const row of PNS_SALARY_SCALE) {
    const current = rankMap.get(row.rank);
    if (!current) {
      rankMap.set(row.rank, { rank: row.rank, minMkg: row.mkg, maxMkg: row.mkg });
    } else {
      current.minMkg = Math.min(current.minMkg, row.mkg);
      current.maxMkg = Math.max(current.maxMkg, row.mkg);
    }
  }

  return ok(res, {
    roles: ROLE_OPTIONS,
    positions: POSITION_OPTIONS,
    orgUnits,
    ranks: Array.from(rankMap.values()),
    salaryScale: PNS_SALARY_SCALE,
    regulation: 'PP 5/2024',
    today: new Date().toISOString().slice(0, 10),
  });
});

// ---------- POST /users (buat akun + pegawai) ----------
router.post('/', requirePermission('user.manage'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const org = await prisma.organizationalUnit.findUnique({ where: { code: b.orgUnitCode } });
  if (!org || !org.isActive) return fail(res, 422, 'Unit kerja tidak ditemukan atau tidak aktif');

  const rank = b.employee.rank ? normalizeRank(b.employee.rank) : null;
  if (b.employee.rank && !rank) return fail(res, 422, 'Golongan tidak valid. Contoh: III/a');

  const position = (b.position ?? defaultPositionForRole(b.role)).toUpperCase();
  const employeePosition = (b.employee.position ?? position).toUpperCase();
  const joinDate = toDate(b.employee.joinDate);
  const rankTmt = toDate(b.employee.rankTmt) ?? joinDate;
  const salary = resolveSalary(rank, rankTmt, joinDate, b.employee.salary ?? null);
  const passwordHash = await bcrypt.hash(b.password, 10);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const employeeNumber = textOrNull(b.employee.employeeNumber) ?? (await nextEmployeeNumber(tx));
      const employee = await tx.employee.create({
        data: {
          employeeNumber,
          nip: textOrNull(b.employee.nip),
          name: b.employee.name.trim(),
          gender: b.employee.gender,
          birthPlace: textOrNull(b.employee.birthPlace),
          birthDate: toDate(b.employee.birthDate),
          employmentStatus: b.employee.employmentStatus,
          position: employeePosition,
          rank,
          rankTmt,
          joinDate,
          salary,
          phone: textOrNull(b.employee.phone),
          address: textOrNull(b.employee.address),
          orgUnitId: org.id,
          isActive: b.employee.isActive ?? (b.role === 'SUPER_ADMIN' ? false : true),
        },
      });

      const user = await tx.user.create({
        data: {
          username: b.username,
          passwordHash,
          role: b.role,
          position,
          employeeId: employee.id,
          orgUnitId: org.id,
          isActive: b.isActive ?? true,
        },
      });

      await applyPositionPolicy(tx, user.id, b.role, position);

      return tx.user.findUnique({
        where: { id: user.id },
        omit: { passwordHash: true },
        include: includeRef,
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Akun dan data pegawai dibuat',
      data: created,
      meta: null,
      errors: null,
    });
  } catch (error) {
    const duplicate = uniqueConstraintMessage(error);
    if (duplicate) return fail(res, 409, duplicate);
    console.error('Gagal membuat akun:', error);
    return fail(res, 500, 'Gagal membuat akun');
  }
});

// ---------- Penugasan Plt ----------
// Dipakai untuk memetakan Sekcam/Camat Plt agar notifikasi dan wewenang
// paraf/persetujuan tetap sampai ke pejabat yang sedang aktif.
router.get('/acting-positions', requirePermission('user.view'), async (req, res) => {
  const { position, active } = req.query as any;
  const where: any = {};
  if (position) where.position = String(position).trim().toUpperCase();
  if (active !== undefined) where.isActive = active === 'true';
  const items = await prisma.actingPosition.findMany({
    where,
    include: {
      user: { omit: { passwordHash: true }, include: { employee: { select: { name: true, nip: true, position: true } } } },
    },
    orderBy: [{ position: 'asc' }, { startsAt: 'desc' }],
  });
  return ok(res, items, 'ok', { total: items.length });
});

router.post('/acting-positions', requirePermission('user.manage'), async (req, res) => {
  const parsed = actingPositionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;
  const startsAt = new Date(b.startsAt);
  const endsAt = b.endsAt ? new Date(b.endsAt) : null;
  if (endsAt && endsAt <= startsAt) return fail(res, 422, 'endsAt harus setelah startsAt');
  const user = await prisma.user.findUnique({ where: { id: b.userId } });
  if (!user || !user.isActive) return fail(res, 422, 'User tidak ditemukan atau tidak aktif');
  const created = await prisma.actingPosition.create({
    data: {
      position: b.position.trim().toUpperCase(),
      userId: b.userId,
      startsAt,
      endsAt,
      reason: b.reason,
    },
    include: {
      user: { omit: { passwordHash: true }, include: { employee: { select: { name: true, nip: true, position: true } } } },
    },
  });
  return res.status(201).json({ success: true, message: 'Penugasan Plt dibuat', data: created, meta: null, errors: null });
});

router.patch('/acting-positions/:id', requirePermission('user.manage'), async (req, res) => {
  const schema = z.object({
    isActive: z.boolean().optional(),
    endsAt: z.string().datetime({ offset: true }).optional().nullable(),
    reason: z.string().max(255).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const existing = await prisma.actingPosition.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, 404, 'Penugasan Plt tidak ditemukan');
  if (parsed.data.endsAt) {
    const endsAt = new Date(parsed.data.endsAt);
    if (endsAt <= existing.startsAt) return fail(res, 422, 'endsAt harus setelah startsAt');
  }
  const updated = await prisma.actingPosition.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.endsAt !== undefined ? { endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null } : {}),
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    },
    include: {
      user: { omit: { passwordHash: true }, include: { employee: { select: { name: true, nip: true, position: true } } } },
    },
  });
  return ok(res, updated, 'Penugasan Plt diperbarui');
});

// ---------- GET /users/:id ----------
router.get('/:id', requirePermission('user.view'), async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.params.id },
    omit: { passwordHash: true },
    include: includeRef,
  });
  if (!u) return fail(res, 404, 'User tidak ditemukan');
  return ok(res, u);
});

// ---------- PATCH /users/:id (role, status, data pegawai) ----------
router.patch('/:id', requirePermission('user.manage'), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const b = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { employee: true, orgUnit: true },
  });
  if (!existing) return fail(res, 404, 'User tidak ditemukan');
  if (!existing.employee) return fail(res, 422, 'Akun ini tidak terhubung ke data pegawai');

  if (b.isActive === false && existing.id === req.user!.id) {
    return fail(res, 409, 'Tidak dapat menonaktifkan akun yang sedang digunakan');
  }

  const targetRole = b.role ?? existing.role;
  const roleChanged = b.role !== undefined && b.role !== existing.role;
  const targetPosition = (
    b.position !== undefined
      ? b.position
      : b.employee?.position !== undefined
        ? b.employee.position
        : roleChanged
          ? defaultPositionForRole(targetRole)
          : existing.position
  )?.trim().toUpperCase() || null;

  if (existing.role === 'SUPER_ADMIN' && targetRole !== 'SUPER_ADMIN') {
    const activeSuperAdmins = await prisma.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });
    if (activeSuperAdmins <= 1) {
      return fail(res, 409, 'Tidak dapat mengubah role Super Admin terakhir');
    }
  }

  const orgCode = b.orgUnitCode ?? existing.orgUnit?.code ?? existing.employee.orgUnitId;
  const org = await prisma.organizationalUnit.findUnique({ where: { code: orgCode } });
  if (!org || !org.isActive) return fail(res, 422, 'Unit kerja tidak ditemukan atau tidak aktif');

  const nextRankInput = b.employee?.rank !== undefined ? b.employee.rank : existing.employee.rank;
  const nextRank = nextRankInput ? normalizeRank(nextRankInput) : null;
  if (nextRankInput && !nextRank) return fail(res, 422, 'Golongan tidak valid. Contoh: III/a');

  const nextRankTmt =
    b.employee?.rankTmt !== undefined ? toDate(b.employee.rankTmt) : existing.employee.rankTmt;
  const nextJoinDate =
    b.employee?.joinDate !== undefined ? toDate(b.employee.joinDate) : existing.employee.joinDate;

  let nextSalary =
    b.employee?.salary !== undefined ? b.employee.salary : existing.employee.salary;
  if (
    b.employee?.rank !== undefined ||
    b.employee?.rankTmt !== undefined ||
    b.employee?.joinDate !== undefined
  ) {
    nextSalary = resolveSalary(nextRank, nextRankTmt, nextJoinDate, nextSalary);
  }

  const nextUserActive = b.isActive ?? existing.isActive;
  const nextEmployeeActive =
    b.employee?.isActive ??
    (b.isActive !== undefined
      ? targetRole === 'SUPER_ADMIN'
        ? false
        : b.isActive
      : existing.employee.isActive);

  const nextEmployeeNumber =
    b.employee?.employeeNumber !== undefined
      ? textOrNull(b.employee.employeeNumber) ?? existing.employee.employeeNumber
      : existing.employee.employeeNumber;

  const passwordHash = b.password ? await bcrypt.hash(b.password, 10) : undefined;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          ...(b.username !== undefined ? { username: b.username } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          ...(b.role !== undefined ? { role: b.role } : {}),
          ...(targetPosition !== existing.position ? { position: targetPosition } : {}),
          orgUnitId: org.id,
          isActive: nextUserActive,
        },
      });

      await tx.employee.update({
        where: { id: existing.employee!.id },
        data: {
          ...(b.employee?.name !== undefined ? { name: b.employee.name } : {}),
          ...(b.employee?.nip !== undefined ? { nip: textOrNull(b.employee.nip) } : {}),
          employeeNumber: nextEmployeeNumber,
          ...(b.employee?.gender !== undefined ? { gender: b.employee.gender } : {}),
          ...(b.employee?.birthPlace !== undefined
            ? { birthPlace: textOrNull(b.employee.birthPlace) }
            : {}),
          ...(b.employee?.birthDate !== undefined
            ? { birthDate: toDate(b.employee.birthDate) }
            : {}),
          ...(b.employee?.employmentStatus !== undefined
            ? { employmentStatus: b.employee.employmentStatus }
            : {}),
          position: targetPosition ?? existing.employee!.position,
          rank: nextRank,
          ...(b.employee?.rankTmt !== undefined ? { rankTmt: nextRankTmt } : {}),
          ...(b.employee?.joinDate !== undefined ? { joinDate: nextJoinDate } : {}),
          ...(nextSalary !== existing.employee!.salary ? { salary: nextSalary } : {}),
          ...(b.employee?.phone !== undefined ? { phone: textOrNull(b.employee.phone) } : {}),
          ...(b.employee?.address !== undefined ? { address: textOrNull(b.employee.address) } : {}),
          orgUnitId: org.id,
          isActive: nextEmployeeActive,
        },
      });

      if (targetRole !== existing.role || targetPosition !== existing.position) {
        await applyPositionPolicy(tx, existing.id, targetRole, targetPosition);
      }

      if (!nextUserActive) {
        await tx.actingPosition.updateMany({
          where: { userId: existing.id, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.user.findUnique({
        where: { id: existing.id },
        omit: { passwordHash: true },
        include: includeRef,
      });
    });

    return ok(res, updated, 'Akun diperbarui');
  } catch (error) {
    const duplicate = uniqueConstraintMessage(error);
    if (duplicate) return fail(res, 409, duplicate);
    console.error('Gagal memperbarui akun:', error);
    return fail(res, 500, 'Gagal memperbarui akun');
  }
});

// ---------- DELETE /users/:id ----------
// Akun tanpa riwayat transaksi dihapus permanen. Akun yang sudah dipakai
// dinonaktifkan agar relasi dan jejak audit tidak rusak.
router.delete('/:id', requirePermission('user.manage'), async (req, res) => {
  const existing = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      employee: {
        include: {
          _count: {
            select: {
              leaveRequests: true,
              attendances: true,
              kgbRequests: true,
              warningLetters: true,
              pensionItems: true,
              promotionItems: true,
            },
          },
        },
      },
      _count: {
        select: {
          uploadedDocs: true,
          actions: true,
          createdLeaves: true,
          recordedAttendances: true,
          correctedAttendances: true,
          createdLetters: true,
          sentDispositions: true,
          receivedDispositions: true,
          uploadedLetterDocs: true,
          createdKgb: true,
          kgbActions: true,
          uploadedKgbDocs: true,
          createdWarnings: true,
          uploadedSessionPhotos: true,
          createdOutgoing: true,
          reservedOutgoing: true,
          uploadedOutgoingDocs: true,
          createdExpeditions: true,
          createdOutgoingExpeditions: true,
          createdArchives: true,
          signedArchiveLists: true,
          createdArchiveLists: true,
          agendaAssignments: true,
          createdPensionBatches: true,
          pensionActions: true,
          uploadedPensionDocs: true,
          createdPromotionBatches: true,
          promotionActions: true,
          uploadedPromotionDocs: true,
          parafActions: true,
        },
      },
    },
  });
  if (!existing) return fail(res, 404, 'User tidak ditemukan');
  if (existing.id === req.user!.id) return fail(res, 409, 'Tidak dapat menghapus akun sendiri');

  if (existing.role === 'SUPER_ADMIN') {
    const activeSuperAdmins = await prisma.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });
    if (activeSuperAdmins <= 1) return fail(res, 409, 'Tidak dapat menghapus Super Admin terakhir');
  }

  const userCounts = existing._count as Record<string, number>;
  const employeeCounts = (existing.employee?._count ?? {}) as Record<string, number>;
  const hasTransactions =
    Object.values(userCounts).some((count) => count > 0) ||
    Object.values(employeeCounts).some((count) => count > 0);

  if (hasTransactions || !existing.employee) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.id }, data: { isActive: false } }),
      ...(existing.employee
        ? [prisma.employee.update({ where: { id: existing.employee.id }, data: { isActive: false } })]
        : []),
      prisma.actingPosition.updateMany({
        where: { userId: existing.id, isActive: true },
        data: { isActive: false },
      }),
    ]);
    return ok(
      res,
      { mode: 'deactivated' },
      'Akun dinonaktifkan karena sudah memiliki riwayat transaksi. Data riwayat tetap disimpan.',
    );
  }

  try {
    await prisma.$transaction([
      prisma.user.delete({ where: { id: existing.id } }),
      prisma.employee.delete({ where: { id: existing.employee.id } }),
    ]);
    return ok(res, { mode: 'deleted' }, 'Akun dan data pegawai dihapus permanen');
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'P2003') {
      await prisma.$transaction([
        prisma.user.update({ where: { id: existing.id }, data: { isActive: false } }),
        prisma.employee.update({
          where: { id: existing.employee.id },
          data: { isActive: false },
        }),
        prisma.actingPosition.updateMany({
          where: { userId: existing.id, isActive: true },
          data: { isActive: false },
        }),
      ]);
      return ok(
        res,
        { mode: 'deactivated' },
        'Akun masih terhubung ke data lain sehingga dinonaktifkan, bukan dihapus permanen.',
      );
    }
    console.error('Gagal menghapus akun:', error);
    return fail(res, 500, 'Gagal menghapus akun');
  }
});

export default router;
