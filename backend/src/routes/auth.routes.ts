import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signAccess, signRefresh, verifyRefresh } from '../lib/jwt';
import { resolvePermissions } from '../lib/permissions';
import { authRequired } from '../middleware/auth';
import { ok, fail } from '../utils/response';

const router = Router();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MESSAGE = 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.';

/** IP klien ternormalisasi (IPv6 memakai subnet /56), '' bila tidak tersedia. */
function clientIp(req: { ip?: string }): string {
  return ipKeyGenerator(req.ip ?? '');
}

/** Username dari body, aman bila body/username kosong atau bukan string. */
function loginUsername(req: { body?: unknown }): string {
  const body = req.body as { username?: unknown } | undefined;
  const raw = body?.username;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Hanya 4xx yang dihitung sebagai percobaan gagal. 5xx (mis. DB mati) bukan
 * kesalahan pengguna sehingga tidak boleh mengunci akun; 2xx/3xx juga tidak.
 */
const countOnlyClientFailures = (_req: unknown, res: { statusCode: number }) =>
  res.statusCode < 400 || res.statusCode >= 500;

/** Batas per IP: mencegah satu sumber mencoba banyak username sekaligus. */
const loginIpLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: countOnlyClientFailures,
  keyGenerator: (req) => clientIp(req),
  handler: (_req, res) => fail(res, 429, LOGIN_MESSAGE),
});

/** Batas per IP + username: satu pengguna tidak bisa mengunci semua orang. */
const loginAccountLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: countOnlyClientFailures,
  keyGenerator: (req) => `${clientIp(req)}|${loginUsername(req)}`,
  handler: (_req, res) => fail(res, 429, LOGIN_MESSAGE),
});

async function userPayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      employee: { include: { orgUnit: true } },
      orgUnit: true,
    },
  });
  if (!user) return null;
  const permissions = await resolvePermissions(user.id, user.role);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    position: user.position,
    email: user.email ?? null,
    phone: user.employee?.phone ?? null,
    orgUnit: user.orgUnit ? { id: user.orgUnit.id, code: user.orgUnit.code, name: user.orgUnit.name } : null,
    // DATA PEGAWAI untuk form (nama, NIP, jabatan=position, masa kerja dihitung frontend dari joinDate, unit kerja).
    employee: user.employee
      ? {
          id: user.employee.id, nip: user.employee.nip, name: user.employee.name,
          position: user.employee.position, rank: user.employee.rank,
          rankTmt: user.employee.rankTmt ? user.employee.rankTmt.toISOString().slice(0, 10) : null,
          joinDate: user.employee.joinDate ? user.employee.joinDate.toISOString().slice(0, 10) : null,
          salary: user.employee.salary,
          phone: user.employee.phone,
          employmentStatus: user.employee.employmentStatus,
          orgUnit: user.employee.orgUnit ? { id: user.employee.orgUnit.id, code: user.employee.orgUnit.code, name: user.employee.orgUnit.name } : null,
        }
      : null,
    permissions,
  };
}

router.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'Validasi gagal', parsed.error.flatten());
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user || !user.isActive) return fail(res, 401, 'Username atau password salah');
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return fail(res, 401, 'Username atau password salah');
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const payload = await userPayload(user.id);
  return ok(res, {
    accessToken: signAccess({ sub: user.id, role: user.role }),
    refreshToken: signRefresh({ sub: user.id }),
    tokenType: 'Bearer',
    expiresIn: 900,
    user: payload,
  }, 'Login berhasil');
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return fail(res, 401, 'refreshToken wajib');
  try {
    const payload = verifyRefresh(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return fail(res, 401, 'User tidak aktif');
    return ok(res, {
      accessToken: signAccess({ sub: user.id, role: user.role }),
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  } catch {
    return fail(res, 401, 'Refresh token tidak valid');
  }
});

router.post('/logout', (_req, res) => ok(res, null, 'Logout berhasil (hapus token di klien, v1 stateless)'));

router.get('/me', authRequired, async (req, res) => {
  const payload = await userPayload(req.user!.id);
  return ok(res, payload);
});

export default router;
