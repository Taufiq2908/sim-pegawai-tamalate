// Aturan transisi cuti: action -> {from, to, permissions (salah satu cukup)}
// Rantai normal (final, disepakati frontend): DRAFT → SUBMITTED → REVIEWED (atasan)
//   → VERIFIED (Kasubag) → PARAF (Sekcam) → APPROVED (Camat: setujui + tandatangani)
//   → REGISTERED (catat pengiriman) → SUBMITTED_BKPSDMD (sudah dikirim)
//   → COMPLETED (receiveresult: hasil diterima + diserahkan) → ARCHIVED (arsip eksplisit).
// Surat pengantar diunduh tanpa mengubah status. Status SIGNED tidak dipakai lagi.
// Pengecualian (langsung VERIFIED dari SUBMITTED, tanpa REVIEWED):
// pemohon CAMAT (→FORWARDED ke Sekda), SEKCAM/LURAH, pegawai kelurahan (sementara).
import { skipsReviewer } from './supervisor.service';

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
  register: { from: ['APPROVED'], to: 'REGISTERED', permissions: ['leave.register'], holderAfter: 'VERIFIER' },
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
  verify: 'leave.paraf', paraf: 'leave.approve', approve: 'leave.register',
  register: 'leave.register', tobkpsdm: 'leave.register',
  receiveresult: 'leave.submit', complete: 'leave.register', archive: null,
  forward: 'leave.sign', reject: null, postpone: null,
};

// Tombol yang boleh tampil per status+permission (dipakai di GET detail)
const ACTION_PERM: Record<string, string[]> = {
  submit: ['leave.submit'], review: ['leave.review'],
  verify: ['leave.verify'], revise: ['leave.verify', 'leave.review'],
  postpone: ['leave.review', 'leave.verify', 'leave.reject'],
  paraf: ['leave.paraf'], approve: ['leave.approve'],
  register: ['leave.register'], tobkpsdm: ['leave.register'], receiveresult: ['leave.register'],
  complete: ['leave.sign'], archive: ['leave.register'], forward: ['leave.forward'],
  reject: ['leave.reject', 'leave.review'],
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION', 'POSTPONED'], review: ['SUBMITTED'],
  verify: ['REVIEWED', 'SUBMITTED'], revise: ['SUBMITTED', 'REVIEWED'],
  postpone: ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF'],
  paraf: ['VERIFIED'], approve: ['PARAF', 'VERIFIED'],
  register: ['APPROVED'], tobkpsdm: ['REGISTERED'], receiveresult: ['SUBMITTED_BKPSDMD'],
  complete: ['FORWARDED'], archive: ['COMPLETED'], forward: ['VERIFIED'],
  reject: ['SUBMITTED', 'REVIEWED', 'VERIFIED', 'PARAF'],
};

export interface ApplicantRef {
  position?: string | null;
  orgType?: string | null;
}

// availableActions sadar jabatan pemohon: sembunyikan aksi yang pasti 422
// (forward non-Camat, approve-VERIFIED non-Sekcam, paraf pemohon-Sekcam,
// review untuk yang melewati REVIEWED, verify-SUBMITTED sebelum REVIEWED).
export function availableActions(status: string, perms: string[], applicant?: ApplicantRef | null): string[] {
  const pos = applicant?.position ?? null;
  const skip = applicant && pos ? skipsReviewer(pos, applicant.orgType ?? null) : null;
  const visible = (a: string): boolean => {
    if (!ACTION_FROM[a].includes(status)) return false;
    if (!perms.includes('*') && !ACTION_PERM[a].some((p) => perms.includes(p))) return false;
    if (a === 'forward' && pos !== 'CAMAT') return false;
    if (a === 'approve' && status === 'VERIFIED' && pos !== 'SEKCAM') return false;
    if (a === 'paraf' && pos === 'SEKCAM') return false;
    if (a === 'review' && skip) return false;
    if (a === 'verify' && status === 'SUBMITTED' && skip === false) return false;
    return true;
  };
  return Object.keys(ACTION_FROM).filter(visible);
}

export function calcDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}
