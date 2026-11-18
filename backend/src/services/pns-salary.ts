import { PNS_SALARY_REGULATION, PNS_SALARY_SCALE, type PnsSalaryRow } from '../data/pns-salary-2024';

export { PNS_SALARY_REGULATION, PNS_SALARY_SCALE };
export type { PnsSalaryRow };

/** Normalisasi golongan: "III/A", " iii a ", "3a" -> "III/a". */
export function normalizeRank(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = value.trim().toLowerCase().replace(/\s+/g, '');
  // Bentuk "3a" / "3/a" -> "III/a". Bentuk "iii/a" sudah benar.
  if (/^[1-4][/]?[a-e]$/.test(s)) {
    const num = Number(s[0]);
    const roman = num === 4 ? 'IV' : 'I'.repeat(num);
    return `${roman}/${s[s.length - 1]}`;
  }
  s = s.replace(/^gol(ongan)?\.?/, '');
  s = s.replace(/^ruang/, '');
  s = s.replace(/[^iv/abcde]/g, '');
  if (!/^(i{1,3}|iv)\/[a-e]$/.test(s)) return null;
  const roman = s.slice(0, s.indexOf('/')).toUpperCase();
  return `${roman}/${s.slice(-1)}`;
}

/** Jumlah tahun penuh antara dua tanggal (bukan pembulatan hari). */
export function fullYearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const beforeAnniversary =
    to.getMonth() < from.getMonth() ||
    (to.getMonth() === from.getMonth() && to.getDate() < from.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

export function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function salaryRowsFor(rank: string): PnsSalaryRow[] {
  const normalized = normalizeRank(rank);
  if (!normalized) return [];
  return PNS_SALARY_SCALE.filter((row) => row.rank === normalized).sort((a, b) => a.mkg - b.mkg);
}

/** Gaji pokok pada MKG tertentu. Bila MKG di bawah baris pertama, pakai baris pertama. */
export function salaryAt(rank: string, mkg: number): number | null {
  const rows = salaryRowsFor(rank);
  if (!rows.length) return null;
  const exactOrLower = [...rows].reverse().find((row) => row.mkg <= mkg);
  return (exactOrLower ?? rows[0]).salary;
}

export function minMkg(rank: string): number | null {
  const rows = salaryRowsFor(rank);
  return rows.length ? rows[0].mkg : null;
}

export function maxMkg(rank: string): number | null {
  const rows = salaryRowsFor(rank);
  return rows.length ? rows[rows.length - 1].mkg : null;
}

/** Baris gaji berikutnya di atas nominal tertentu (dipakai saat master gaji tidak sinkron). */
export function nextSalaryAbove(rank: string, salary: number): PnsSalaryRow | null {
  return salaryRowsFor(rank).find((row) => row.salary > salary) ?? null;
}
