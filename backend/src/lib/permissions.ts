import { prisma } from '../lib/prisma';

// Efektif = role_permissions + GRANT - DENY. SUPER_ADMIN bypass semua.
export async function resolvePermissions(userId: string, role: string): Promise<string[]> {
  if (role === 'SUPER_ADMIN') return ['*'];
  const roleRow = await prisma.role.findUnique({
    where: { code: role as any },
    include: { permissions: { include: { permission: true } } },
  });
  const base = new Set((roleRow?.permissions ?? []).map((rp) => rp.permission.code));
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId },
    include: { permission: true },
  });
  for (const o of overrides) {
    if (o.effect === 'GRANT') base.add(o.permission.code);
    if (o.effect === 'DENY') base.delete(o.permission.code);
  }
  return [...base];
}

export function can(perms: string[], need: string) {
  return perms.includes('*') || perms.includes(need);
}
