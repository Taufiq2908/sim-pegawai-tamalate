import { Router } from 'express';
import { authRequired, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../utils/response';

const router = Router();
router.use(authRequired);

const includeRef = {
  employee: true,
  orgUnit: true,
};

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
