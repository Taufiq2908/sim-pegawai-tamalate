// Aturan transisi cuti: action -> {from, to, permissions (salah satu cukup)}
// Rantai normal (docs 05): DRAFT → SUBMITTED → REVIEWED (atasan langsung)
//   → VERIFIED (Kasubag) → PARAF (Sekcam) → APPROVED (Camat) → SIGNED (catat
//   jawaban BKPSDM) → REGISTERED → SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED.
// Pengecualian (langsung VERIFIED dari SUBMITTED, tanpa REVIEWED):
// pemohon CAMAT (→FORWARDED ke Sekda), SEKCAM/LURAH (langsung ke Camat),
// pegawai kelurahan (sementara, menunggu mapping final B3).
export interface Transition {
  from: string[];
  to: string;
  permissions: string[];
  holderAfter: string;
}

export const TRANSITIONS: Record<string, Transition> = {
  submit:   { from: ['DRAFT', 'REVISION', 'POSTPONED'], to: 'SUBMITTED', permissions: ['leave.submit'], holderAfter: 'VERIFIER' },
  review:   { from: ['SUBMITTED'], to: 'REVIEWED', permissions: ['leave.review'], holderAfter: 'VERIFIER' },
  verify:   { from: ['REVIEWED', 'SUBMITTED'], to: 'VERIFIED', permissions: ['leave.verify'], holderAfter: 'LEADER' },
  revise:   { from: ['SUBMITTED', 'REVIEWED'], to: 'REVISION', permissions: ['leave.verify', 'leave.review'], holderAfter: 'EMPLOYEE' },
  postpone: { from: ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF'], to: 'POSTPONED', permissions: ['leave.review', 'leave.verify', 'leave.reject'], holderAfter: 'EMPLOYEE' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permissions: ['leave.paraf'], holderAfter: 'LEADER' },
  approve:  { from: ['PARAF', 'VERIFIED'], to: 'APPROVED', permissions: ['leave.approve'], holderAfter: 'LEADER' },
  sign:     { from: ['APPROVED'], to: 'SIGNED', permissions: ['leave.sign'], holderAfter: 'VERIFIER' },
  register: { from: ['SIGNED'], to: 'REGISTERED', permissions: ['leave.register'], holderAfter: 'VERIFIER' },
  tobkpsdm: { from: ['REGISTERED'], to: 'SUBMITTED_BKPSDMD', permissions: ['leave.register'], holderAfter: 'VERIFIER' },
  receiveresult: { from: ['SUBMITTED_BKPSDMD'], to: 'COMPLETED', permissions: ['leave.register'], holderAfter: 'DONE' },
  complete: { from: ['FORWARDED'], to: 'COMPLETED', permissions: ['leave.sign'], holderAfter: 'DONE' },
  archive:  { from: ['COMPLETED'], to: 'ARCHIVED', permissions: ['leave.register'], holderAfter: 'DONE' },
  forward:  { from: ['VERIFIED'], to: 'FORWARDED', permissions: ['leave.forward'], holderAfter: 'SEKDA' },
  reject:   { from: ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permissions: ['leave.reject', 'leave.review'], holderAfter: 'DONE' },
};

// Permission pemegang tahap berikut (untuk notifikasi B8).
export const NEXT_PERMISSION: Record<string, string | null> = {
  submit: 'leave.review', review: 'leave.verify', revise: 'leave.submit',
  verify: 'leave.paraf', paraf: 'leave.approve', approve: 'leave.sign',
  sign: 'leave.register', register: 'leave.register', tobkpsdm: 'leave.register',
  receiveresult: 'leave.submit', complete: 'leave.register', archive: null,
  forward: 'leave.sign', reject: null, postpone: null,
};

// Tombol yang boleh tampil per status+permission (dipakai di GET detail)
const ACTION_PERM: Record<string, string[]> = {
  submit: ['leave.submit'], review: ['leave.review'],
  verify: ['leave.verify'], revise: ['leave.verify', 'leave.review'],
  postpone: ['leave.review', 'leave.verify', 'leave.reject'],
  paraf: ['leave.paraf'], approve: ['leave.approve'], sign: ['leave.sign'],
  register: ['leave.register'], tobkpsdm: ['leave.register'], receiveresult: ['leave.register'],
  complete: ['leave.sign'], archive: ['leave.register'], forward: ['leave.forward'],
  reject: ['leave.reject', 'leave.review'],
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION', 'POSTPONED'], review: ['SUBMITTED'],
  verify: ['REVIEWED', 'SUBMITTED'], revise: ['SUBMITTED', 'REVIEWED'],
  postpone: ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF'],
  paraf: ['VERIFIED'], approve: ['PARAF', 'VERIFIED'], sign: ['APPROVED'],
  register: ['SIGNED'], tobkpsdm: ['REGISTERED'], receiveresult: ['SUBMITTED_BKPSDMD'],
  complete: ['FORWARDED'], archive: ['COMPLETED'], forward: ['VERIFIED'],
  reject: ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF'],
};

export function availableActions(status: string, perms: string[]): string[] {
  if (perms.includes('*')) return Object.keys(ACTION_FROM).filter((a) => ACTION_FROM[a].includes(status));
  return Object.keys(ACTION_FROM).filter(
    (a) => ACTION_FROM[a].includes(status) && ACTION_PERM[a].some((p) => perms.includes(p)),
  );
}

export function calcDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}
