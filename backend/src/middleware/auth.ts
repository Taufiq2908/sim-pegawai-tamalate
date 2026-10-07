import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { resolvePermissions } from '../lib/permissions';
import { fail } from '../utils/response';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  position: string | null;
  orgUnitId: string | null;
  employeeId: string | null;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return fail(res, 401, 'Missing bearer token');
  try {
    const payload = verifyAccess(h.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return fail(res, 401, 'User inactive or not found');
    const permissions = await resolvePermissions(user.id, user.role);
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      position: user.position,
      orgUnitId: user.orgUnitId,
      employeeId: user.employeeId,
      permissions,
    };
    next();
  } catch {
    return fail(res, 401, 'Invalid or expired token');
  }
}

export function requirePermission(code: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const perms = req.user?.permissions ?? [];
    if (perms.includes('*') || perms.includes(code)) return next();
    return fail(res, 403, `Forbidden: butuh permission ${code}`);
  };
}
