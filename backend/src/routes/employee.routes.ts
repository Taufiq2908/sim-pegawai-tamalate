import { Router } from 'express';
import { authRequired, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../utils/response';

const router = Router();
router.use(authRequired);

const includeRef = {
  orgUnit: true,
  user: { omit: { passwordHash: true } },
};

// ---------- GET /employees ----------
router.get('/', requirePermission('employee.view'), async (req, res) => {
  const { q, orgUnit, employmentStatus, page = '1', limit = '20' } = req.query as any;
  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: String(q), mode: 'insensitive' } },
      { nip: { contains: String(q), mode: 'insensitive' } },
      { employeeNumber: { contains: String(q), mode: 'insensitive' } },
    ];
  }
  if (orgUnit) where.orgUnit = { code: String(orgUnit) };
  if (employmentStatus) where.employmentStatus = String(employmentStatus);
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 20);
  const [total, items] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      include: includeRef,
      orderBy: { name: 'asc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- GET /employees/:id ----------
router.get('/:id', requirePermission('employee.view'), async (req, res) => {
  const e = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: includeRef,
  });
  if (!e) return fail(res, 404, 'Employee tidak ditemukan');
  return ok(res, e);
});

export default router;
