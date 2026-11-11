import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../utils/response';

const router = Router();
router.use(authRequired);

const includeRef = {
  employee: true,
  orgUnit: true,
};

const actingPositionSchema = z.object({
  position: z.string().min(1).max(50),
  userId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  reason: z.string().max(255).optional(),
});

// ---------- GET /users ----------
router.get('/', requirePermission('user.view'), async (req, res) => {
  const { q, role, orgUnit, active, page = '1', limit = '20' } = req.query as any;
  const where: any = {};
  if (q) where.username = { contains: String(q), mode: 'insensitive' };
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

export default router;
