// Aturan transisi KGB: action -> {from, to, permission}
// Rantai KGB (SOP 9 langkah):
// DRAFT → SUBMITTED → VERIFIED → PARAF → APPROVED → REGISTERED →
// SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED
// (+REVISION/REJECTED)
// `return` adalah tindakan Sekcam/Camat mengembalikan dokumen ke pemohon
// dengan catatan wajib. `revise` tetap dipakai Kasubag saat SUBMITTED.
import { hasPosition } from './position.service';

export const TRANSITIONS: Record<string, { from: string[]; to: string; permission: string; holderAfter: string }> = {
  submit:   { from: ['DRAFT', 'REVISION'], to: 'SUBMITTED', permission: 'kgb.submit', holderAfter: 'VERIFIER' },
  verify:   { from: ['SUBMITTED'], to: 'VERIFIED', permission: 'kgb.verify', holderAfter: 'LEADER' },
  revise:   { from: ['SUBMITTED'], to: 'REVISION', permission: 'kgb.verify', holderAfter: 'EMPLOYEE' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'kgb.paraf', holderAfter: 'LEADER' },
  return:   { from: ['VERIFIED', 'PARAF'], to: 'REVISION', permission: 'kgb.approve', holderAfter: 'EMPLOYEE' },
  approve:  { from: ['PARAF'], to: 'APPROVED', permission: 'kgb.approve', holderAfter: 'LEADER' },
  register: { from: ['APPROVED'], to: 'REGISTERED', permission: 'kgb.register', holderAfter: 'VERIFIER' },
  tobkpsdm: { from: ['REGISTERED'], to: 'SUBMITTED_BKPSDMD', permission: 'kgb.register', holderAfter: 'VERIFIER' },
  complete: { from: ['SUBMITTED_BKPSDMD'], to: 'COMPLETED', permission: 'kgb.register', holderAfter: 'DONE' },
  archive:  { from: ['COMPLETED'], to: 'ARCHIVED', permission: 'kgb.register', holderAfter: 'DONE' },
  reject:   { from: ['SUBMITTED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'kgb.reject', holderAfter: 'DONE' },
};

const ACTION_PERM: Record<string, string> = {
  submit: 'kgb.submit', verify: 'kgb.verify', revise: 'kgb.verify',
  paraf: 'kgb.paraf', approve: 'kgb.approve', return: 'kgb.approve',
  register: 'kgb.register', tobkpsdm: 'kgb.register', complete: 'kgb.register',
  archive: 'kgb.register', reject: 'kgb.reject',
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION'], verify: ['SUBMITTED'], revise: ['SUBMITTED'],
  paraf: ['VERIFIED'], approve: ['PARAF'], return: ['VERIFIED', 'PARAF'],
  register: ['APPROVED'], tobkpsdm: ['REGISTERED'], complete: ['SUBMITTED_BKPSDMD'],
  archive: ['COMPLETED'], reject: ['SUBMITTED', 'VERIFIED', 'PARAF'],
};

export interface KgbActorContext {
  role?: string | null;
  position?: string | null;
  /** Hasil pengecekan Plt aktif; route tetap menjadi penentu akhir. */
  holdsSekcam?: boolean;
  holdsCamat?: boolean;
}

export function availableActions(
  status: string,
  perms: string[],
  actor?: KgbActorContext,
): string[] {
  const isSuper = perms.includes('*');
  const actorIs = (position: string) => {
    if (isSuper) return true;
    if (position === 'SEKCAM' && actor?.holdsSekcam) return true;
    if (position === 'CAMAT' && actor?.holdsCamat) return true;
    return hasPosition(actor?.position, position);
  };
  return Object.keys(ACTION_FROM).filter((a) => {
    if (!ACTION_FROM[a].includes(status)) return false;
    if (!isSuper && !perms.includes(ACTION_PERM[a])) return false;
    if (a === 'paraf' && !actorIs('SEKCAM')) return false;
    if (a === 'approve' && !actorIs('CAMAT')) return false;
    if (a === 'return' && status === 'VERIFIED' && !actorIs('SEKCAM')) return false;
    if (a === 'return' && status === 'PARAF' && !actorIs('CAMAT')) return false;
    if (a === 'reject' && status === 'VERIFIED' && !actorIs('SEKCAM')) return false;
    if (a === 'reject' && status === 'PARAF' && !actorIs('CAMAT')) return false;
    return true;
  });
}

export function waitingFor(status: string): string {
  switch (status) {
    case 'DRAFT':
    case 'REVISION':
      return 'Pemohon';
    case 'SUBMITTED':
      return 'Kasubag';
    case 'VERIFIED':
      return 'Sekcam';
    case 'PARAF':
      return 'Camat';
    case 'APPROVED':
      return 'Registrasi kecamatan';
    case 'REGISTERED':
      return 'Penerusan ke BKPSDM';
    case 'SUBMITTED_BKPSDMD':
      return 'Hasil BKPSDM';
    case 'COMPLETED':
      return 'Arsip';
    case 'ARCHIVED':
    case 'REJECTED':
      return '-';
    default:
      return status;
  }
}

export function calcDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

// Dokumen yang harus disiapkan pegawai untuk usul KGB (step 2 SOP).
export const KGB_REQUIRED_DOCS = [
  'SK_CPNS_TERAKHIR',
  'SK_PANGKAT_TERAKHIR',
  'SKP_2_TAHUN',
  'KP4',
  'KTP',
  'NPWP',
  'REKENING_GAJI',
];

// Interval KGB standar: setiap 2 tahun (regulasi KGB).
export const KGB_INTERVAL_YEARS = 2;
export const KGB_REMINDER_MONTHS = 3; // notifikasi 3 bulan sebelum jatuh tempo
// Reminder masih dikirim untuk KGB yang terlambat, maksimal 12 bulan ke belakang.
// Di luar itu data dianggap sudah tidak relevan (mis. pegawai sudah pensiun/pindah).
export const KGB_OVERDUE_MONTHS = 12;

/** Selisih bulan kalender (bukan hari), konsisten dengan monitoring/reminder. */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export interface KgbSchedule {
  nextKgbDate: string; // YYYY-MM-DD
  monthsUntil: number;
  dueSoon: boolean;
  isOverdue: boolean;
}

/** Jatuh tempo KGB = basis (KGB final terakhir / tanggal masuk) + 2 tahun. */
export function computeKgbSchedule(baseDate: Date, now = new Date()): KgbSchedule {
  const next = new Date(baseDate);
  next.setFullYear(next.getFullYear() + KGB_INTERVAL_YEARS);
  const monthsUntil = monthsBetween(now, next);
  return {
    nextKgbDate: next.toISOString().slice(0, 10),
    monthsUntil,
    dueSoon: monthsUntil >= 0 && monthsUntil <= KGB_REMINDER_MONTHS,
    isOverdue: monthsUntil < 0,
  };
}
