// Aturan transisi cuti: action -> {from, to, permission}
// Khusus: FORWARDED hanya untuk pengajuan CAMAT (diteruskan ke Sekda, luar sistem).
export const TRANSITIONS: Record<string, { from: string[]; to: string; permission: string; holderAfter: string }> = {
  submit:   { from: ['DRAFT', 'REVISION'], to: 'SUBMITTED', permission: 'leave.submit', holderAfter: 'VERIFIER' },
  verify:   { from: ['SUBMITTED'], to: 'VERIFIED', permission: 'leave.verify', holderAfter: 'LEADER' },
  revise:   { from: ['SUBMITTED'], to: 'REVISION', permission: 'leave.verify', holderAfter: 'EMPLOYEE' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'leave.paraf', holderAfter: 'LEADER' },
  approve:  { from: ['PARAF'], to: 'APPROVED', permission: 'leave.approve', holderAfter: 'LEADER' },
  sign:     { from: ['APPROVED'], to: 'SIGNED', permission: 'leave.sign', holderAfter: 'DONE' },
  complete: { from: ['SIGNED', 'FORWARDED'], to: 'COMPLETED', permission: 'leave.sign', holderAfter: 'DONE' },
  forward:  { from: ['VERIFIED'], to: 'FORWARDED', permission: 'leave.forward', holderAfter: 'SEKDA' },
  reject:   { from: ['SUBMITTED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'leave.reject', holderAfter: 'DONE' },
};

// Tombol yang boleh tampil per status+permission (dipakai di GET detail)
const ACTION_PERM: Record<string, string> = {
  submit: 'leave.submit', verify: 'leave.verify', revise: 'leave.verify',
  paraf: 'leave.paraf', approve: 'leave.approve', sign: 'leave.sign',
  complete: 'leave.sign', forward: 'leave.forward', reject: 'leave.reject',
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION'], verify: ['SUBMITTED'], revise: ['SUBMITTED'],
  paraf: ['VERIFIED'], approve: ['PARAF'], sign: ['APPROVED'],
  complete: ['SIGNED', 'FORWARDED'], forward: ['VERIFIED'],
  reject: ['SUBMITTED', 'VERIFIED', 'PARAF'],
};

export function availableActions(status: string, perms: string[]): string[] {
  if (perms.includes('*')) return Object.keys(ACTION_FROM).filter((a) => ACTION_FROM[a].includes(status));
  return Object.keys(ACTION_FROM).filter(
    (a) => ACTION_FROM[a].includes(status) && perms.includes(ACTION_PERM[a]),
  );
}

export function calcDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}
