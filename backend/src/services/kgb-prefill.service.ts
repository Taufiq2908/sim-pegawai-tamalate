import { prisma } from '../lib/prisma';
import {
  addYears,
  fullYearsBetween,
  normalizeRank,
  PNS_SALARY_REGULATION,
} from './pns-salary';
import { getMaxMkg, getSalaryAt } from './salary.service';

const FINAL_KGB_STATUSES = ['COMPLETED', 'ARCHIVED'];

export interface KgbPrefill {
  employeeId: string;
  employeeName: string;
  nip: string | null;
  rank: string;
  rankTmt: string | null;
  joinDate: string | null;
  totalYears: number;
  oldRank: string;
  newRank: string;
  oldSalary: number;
  newSalary: number;
  mkg: number;
  newMkg: number;
  maxMkg: number;
  atMax: boolean;
  scheduledDate: string;
  effectiveDate: string;
  overdueMonths: number;
  regulation: string;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Hitung data KGB dari master kepegawaian:
 * - golongan dari Employee.rank
 * - MKG dari TMT pangkat terakhir (fallback tanggal masuk)
 * - gaji pokok dari skala_gaji_pns (PP 5/2024)
 * - TMT KGB berikutnya dari KGB final terakhir + 2 tahun (fallback tanggal masuk)
 */
export async function buildKgbPrefill(employeeId: string): Promise<KgbPrefill | null> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return null;

  const today = new Date();
  const rank = normalizeRank(emp.rank) ?? 'III/a';
  const rankTmt = emp.rankTmt ?? emp.joinDate ?? today;
  const joinDate = emp.joinDate ?? rankTmt;
  const totalYears = fullYearsBetween(joinDate, today);
  const mkg = fullYearsBetween(rankTmt, today);
  const max = (await getMaxMkg(rank)) ?? mkg;
  const atMax = mkg >= max;
  const newMkg = atMax ? mkg : Math.min(mkg + 2, max);

  const current = await getSalaryAt(rank, mkg);
  const next = await getSalaryAt(rank, newMkg);
  const oldSalary = emp.salary ?? current?.salary ?? 0;
  let newSalary = atMax ? oldSalary : (next?.salary ?? oldSalary);

  // Jika gaji master lebih tinggi daripada baris tabel (mis. data lama), cari
  // baris berikutnya yang nominalnya benar-benar lebih besar.
  if (!atMax && newSalary <= oldSalary) {
    const above = await prisma.pnsSalaryScale.findFirst({
      where: { rank, salary: { gt: oldSalary } },
      orderBy: { salary: 'asc' },
    });
    if (above) newSalary = above.salary;
  }

  const lastFinal = await prisma.kgbRequest.findFirst({
    where: { employeeId, status: { in: FINAL_KGB_STATUSES } },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    select: { effectiveDate: true },
  });

  const scheduleBase = lastFinal ? new Date(lastFinal.effectiveDate) : joinDate;
  const scheduled = addYears(scheduleBase, 2);
  const overdueMonths = scheduled < today ? Math.max(0, monthsBetween(scheduled, today)) : 0;
  // TMT default mengikuti jadwal KGB berikutnya; bila sudah lewat, pakai hari ini.
  const effective = scheduled < today ? today : scheduled;

  return {
    employeeId: emp.id,
    employeeName: emp.name,
    nip: emp.nip,
    rank,
    rankTmt: emp.rankTmt ? ymd(emp.rankTmt) : null,
    joinDate: emp.joinDate ? ymd(emp.joinDate) : null,
    totalYears,
    oldRank: rank,
    newRank: rank,
    oldSalary,
    newSalary,
    mkg,
    newMkg,
    maxMkg: max,
    atMax: atMax || newSalary <= oldSalary,
    scheduledDate: ymd(scheduled),
    effectiveDate: ymd(effective),
    overdueMonths,
    regulation: PNS_SALARY_REGULATION,
  };
}
