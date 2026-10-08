import { Router } from 'express';
import { authRequired, requirePermission } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../utils/response';
import { resolveSupervisor } from '../services/supervisor.service';

const router = Router();
router.use(authRequired);

const includeRef = {
  orgUnit: true,
  user: { omit: { passwordHash: true } },
};

// Boleh bila data milik sendiri atau punya employee.view.
function canAccessEmployee(req: any, id: string): boolean {
  if (req.user?.role === 'SUPER_ADMIN') return true;
  if (req.user?.employeeId && req.user.employeeId === id) return true;
  return (req.user?.permissions ?? []).includes('*') || (req.user?.permissions ?? []).includes('employee.view');
}

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

// ---------- GET /employees/:id/supervisor (B3: atasan langsung) ----------
router.get('/:id/supervisor', async (req, res) => {
  if (!canAccessEmployee(req, req.params.id)) return fail(res, 403, 'Hanya data sendiri atau butuh permission employee.view');
  const e = await prisma.employee.findUnique({ where: { id: req.params.id }, include: { orgUnit: true } });
  if (!e) return fail(res, 404, 'Employee tidak ditemukan');
  return ok(res, await resolveSupervisor({ position: e.position, orgUnit: e.orgUnit }));
});

// ---------- GET /employees/:id/leave-history (B6: riwayat cuti per pegawai) ----------
router.get('/:id/leave-history', async (req, res) => {
  if (!canAccessEmployee(req, req.params.id)) return fail(res, 403, 'Hanya data sendiri atau butuh permission employee.view');
  const { year, status } = req.query as any;
  const where: any = { employeeId: req.params.id };
  if (status) where.status = status;
  if (year) {
    const y = Number(year);
    where.startDate = { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31`) };
  }
  const items = await prisma.leaveRequest.findMany({
    where,
    include: { leaveType: true },
    orderBy: { startDate: 'desc' },
    take: 200,
  });
  return ok(res, items.map((r) => ({
    id: r.id,
    requestNumber: r.requestNumber,
    year: r.startDate.toISOString().slice(0, 4),
    leaveType: { code: r.leaveType.code, name: r.leaveType.name },
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    days: r.totalDays,
    status: r.status,
  })));
});

// ---------- GET /employees/:id/leave-balance (B6: saldo cuti tahunan) ----------
// Aturan v1 (wewenang backend): hak = maxDays jenis TAHUNAN aktif;
// terpakai = total hari TAHUNAN berstatus APPROVED ke atas pada tahun berjalan
// (APPROVED/SIGNED/REGISTERED/SUBMITTED_BKPSDMD/COMPLETED). Jenis lain tidak
// mengurangi saldo (berbasis dokumen/syarat, bukan kuota).
router.get('/:id/leave-balance', async (req, res) => {
  if (!canAccessEmployee(req, req.params.id)) return fail(res, 403, 'Hanya data sendiri atau butuh permission employee.view');
  const year = Number((req.query as any).year) || new Date().getFullYear();
  const annual = await prisma.leaveType.findUnique({ where: { code: 'TAHUNAN' } });
  const entitlement = annual?.isActive ? (annual.maxDays ?? 12) : 12;
  const usedRows = await prisma.leaveRequest.findMany({
    where: {
      employeeId: req.params.id,
      leaveType: { code: 'TAHUNAN' },
      status: { in: ['APPROVED', 'SIGNED', 'REGISTERED', 'SUBMITTED_BKPSDMD', 'COMPLETED'] },
      startDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
    },
    select: { totalDays: true },
  });
  const used = usedRows.reduce((a, r) => a + r.totalDays, 0);
  return ok(res, { year, type: 'TAHUNAN', entitlement, used, remaining: entitlement - used });
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
