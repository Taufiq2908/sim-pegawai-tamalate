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

export function canAny(perms: string[], needs: string[]) {
  return perms.includes('*') || needs.some((n) => perms.includes(n));
}

// Semua user aktif yang efektif memegang permission (role + GRANT − DENY,
// tanpa SUPER_ADMIN agar tidak membanjiri notifikasi).
export async function usersForPermission(code: string): Promise<string[]> {
  const perm = await prisma.permission.findUnique({ where: { code } });
  if (!perm) return [];
  const [roleLinks, grants, denies] = await Promise.all([
    prisma.rolePermission.findMany({ where: { permissionId: perm.id }, include: { role: true } }),
    prisma.userPermissionOverride.findMany({ where: { permissionId: perm.id, effect: 'GRANT' }, select: { userId: true } }),
    prisma.userPermissionOverride.findMany({ where: { permissionId: perm.id, effect: 'DENY' }, select: { userId: true } }),
  ]);
  const denySet = new Set(denies.map((d) => d.userId));
  const roleCodes = roleLinks.map((r) => r.role.code).filter((c) => c !== 'SUPER_ADMIN');
  const inRole = roleCodes.length
    ? await prisma.user.findMany({ where: { isActive: true, role: { in: roleCodes } }, select: { id: true } })
    : [];
  const ids = new Set<string>();
  for (const u of inRole) if (!denySet.has(u.id)) ids.add(u.id);
  if (grants.length) {
    const granted = await prisma.user.findMany({ where: { isActive: true, id: { in: grants.map((g) => g.userId) } }, select: { id: true } });
    for (const u of granted) if (!denySet.has(u.id)) ids.add(u.id);
  }
  return [...ids];
}
