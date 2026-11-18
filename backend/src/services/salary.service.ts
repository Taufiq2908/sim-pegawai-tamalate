import { prisma } from '../lib/prisma';
import { normalizeRank, salaryAt as salaryAtConstant, maxMkg as maxMkgConstant } from './pns-salary';

export interface SalaryLookup {
  rank: string;
  mkg: number;
  salary: number;
}

/** Ambil gaji pokok dari master `skala_gaji_pns`, fallback ke tabel PP 5/2024. */
export async function getSalaryAt(rankInput: string, mkg: number): Promise<SalaryLookup | null> {
  const rank = normalizeRank(rankInput);
  if (!rank) return null;
  const target = Math.max(0, Math.floor(mkg));

  const row =
    (await prisma.pnsSalaryScale.findFirst({
      where: { rank, mkg: { lte: target } },
      orderBy: { mkg: 'desc' },
    })) ??
    (await prisma.pnsSalaryScale.findFirst({
      where: { rank },
      orderBy: { mkg: 'asc' },
    }));

  if (row) return { rank, mkg: row.mkg, salary: row.salary };

  const fallback = salaryAtConstant(rank, target);
  if (fallback == null) return null;
  return { rank, mkg: target, salary: fallback };
}

export async function getMaxMkg(rankInput: string): Promise<number | null> {
  const rank = normalizeRank(rankInput);
  if (!rank) return null;
  const row = await prisma.pnsSalaryScale.findFirst({
    where: { rank },
    orderBy: { mkg: 'desc' },
  });
  return row?.mkg ?? maxMkgConstant(rank);
}
