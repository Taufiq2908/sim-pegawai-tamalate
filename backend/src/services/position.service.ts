import { prisma } from '../lib/prisma';

/**
 * Normalisasi nilai jabatan. Nilai Plt dapat ditulis dengan awalan
 * PLT_, PLT., PLT-, atau "PLT " dan tetap dianggap memegang jabatan dasarnya.
 * Contoh: PLT_SEKCAM -> SEKCAM.
 */
export function normalizePosition(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  const match = /^PLT[\s._-]+(.+)$/.exec(raw);
  return (match?.[1] ?? raw).trim();
}

export function hasPosition(
  current: string | null | undefined,
  target: string,
): boolean {
  return normalizePosition(current) === target.trim().toUpperCase();
}

function positionAliases(position: string): string[] {
  const pos = position.trim().toUpperCase();
  return [pos, `PLT_${pos}`, `PLT.${pos}`, `PLT-${pos}`, `PLT ${pos}`];
}

function activeWindow(now: Date) {
  return {
    isActive: true,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }],
  };
}

/** Semua user aktif yang memegang jabatan, termasuk Plt yang sedang aktif. */
export async function userIdsForPosition(position: string): Promise<string[]> {
  const pos = position.trim().toUpperCase();
  const now = new Date();
  const [direct, acting] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, position: { in: positionAliases(pos) } },
      select: { id: true },
    }),
    prisma.actingPosition.findMany({
      where: { position: pos, ...activeWindow(now), user: { isActive: true } },
      select: { userId: true },
    }),
  ]);
  return [...new Set([...direct.map((u) => u.id), ...acting.map((a) => a.userId)])];
}

/** Cek apakah user memegang jabatan, baik langsung maupun sebagai Plt aktif. */
export async function userHoldsPosition(userId: string, position: string): Promise<boolean> {
  const pos = position.trim().toUpperCase();
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { position: true, isActive: true },
  });
  if (!user?.isActive) return false;
  if (hasPosition(user.position, pos)) return true;
  const acting = await prisma.actingPosition.count({
    where: { userId, position: pos, ...activeWindow(now) },
  });
  return acting > 0;
}

/** Satu user aktif pertama untuk jabatan, dipakai saat menampilkan penandatangan. */
export async function primaryUserForPosition(position: string) {
  const ids = await userIdsForPosition(position);
  if (!ids.length) return null;
  return prisma.user.findFirst({
    where: { id: { in: ids }, isActive: true },
    include: { employee: { select: { name: true, nip: true, position: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

/** Label jabatan yang mudah ditampilkan; Plt tetap ditandai. */
export function positionLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (/^PLT[\s._-]+/.test(raw)) return `Plt. ${normalizePosition(raw)}`;
  return raw;
}

/**
 * Jabatan yang benar-benar dipakai saat aksi. Jika user bertindak sebagai Plt
 * aktif, snapshot menyimpan "Plt. SEKCAM"/"Plt. CAMAT", bukan jabatan aslinya.
 */
export async function effectivePosition(
  userId: string,
  directPosition: string | null,
  actingAs: string | null,
): Promise<string | null> {
  if (!actingAs) return directPosition;
  const pos = actingAs.trim().toUpperCase();
  if (hasPosition(directPosition, pos)) return directPosition;
  const acting = await prisma.actingPosition.findFirst({
    where: { userId, position: pos, ...activeWindow(new Date()) },
    orderBy: { startsAt: 'desc' },
    select: { id: true },
  });
  return acting ? `Plt. ${pos}` : directPosition;
}
