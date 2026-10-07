import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../utils/response';

const router = Router();
router.use(authRequired);

// Notifikasi milik sendiri (mis. disposisi baru). Tanpa permission khusus.

// ---------- GET /notifications/unread-count ----------
router.get('/unread-count', async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  return ok(res, { unread: count });
});

// ---------- GET /notifications ----------
router.get('/', async (req, res) => {
  const { unread, page = '1', limit = '20' } = req.query as any;
  const where: any = { userId: req.user!.id };
  if (unread === 'true') where.isRead = false;
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Number(limit) || 20);
  const [total, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]);
  return ok(res, items, 'ok', { page: p, limit: l, total });
});

// ---------- PATCH /notifications/:id/read ----------
router.patch('/:id/read', async (req, res) => {
  const n = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!n) return fail(res, 404, 'Notifikasi tidak ditemukan');
  const updated = await prisma.notification.update({
    where: { id: n.id },
    data: { isRead: true, readAt: new Date() },
  });
  return ok(res, updated, 'Ditandai dibaca');
});

export default router;
