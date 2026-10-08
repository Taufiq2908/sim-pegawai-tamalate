// Aturan transisi cuti: action -> {from, to, permission}
// Khusus: FORWARDED hanya untuk pengajuan CAMAT (diteruskan ke Sekda, luar sistem).
// Ekor BKPSDMD (staf operator kecamatan): SIGNED -> REGISTERED -> SUBMITTED_BKPSDMD
//   -> COMPLETED -> ARCHIVED. APPROVE dari VERIFIED hanya untuk pemohon SEKCAM
//   (lompat-paraf, dicek di route).
export const TRANSITIONS: Record<string, { from: string[]; to: string; permission: string; holderAfter: string }> = {
  submit:   { from: ['DRAFT', 'REVISION'], to: 'SUBMITTED', permission: 'leave.submit', holderAfter: 'VERIFIER' },
  verify:   { from: ['SUBMITTED'], to: 'VERIFIED', permission: 'leave.verify', holderAfter: 'LEADER' },
  revise:   { from: ['SUBMITTED'], to: 'REVISION', permission: 'leave.verify', holderAfter: 'EMPLOYEE' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'leave.paraf', holderAfter: 'LEADER' },
  approve:  { from: ['PARAF', 'VERIFIED'], to: 'APPROVED', permission: 'leave.approve', holderAfter: 'LEADER' },
  sign:     { from: ['APPROVED'], to: 'SIGNED', permission: 'leave.sign', holderAfter: 'VERIFIER' },
  register: { from: ['SIGNED'], to: 'REGISTERED', permission: 'leave.register', holderAfter: 'VERIFIER' },
  tobkpsdm: { from: ['REGISTERED'], to: 'SUBMITTED_BKPSDMD', permission: 'leave.register', holderAfter: 'VERIFIER' },
  receiveresult: { from: ['SUBMITTED_BKPSDMD'], to: 'COMPLETED', permission: 'leave.register', holderAfter: 'DONE' },
  complete: { from: ['FORWARDED'], to: 'COMPLETED', permission: 'leave.sign', holderAfter: 'DONE' },
  archive:  { from: ['COMPLETED'], to: 'ARCHIVED', permission: 'leave.register', holderAfter: 'DONE' },
  forward:  { from: ['VERIFIED'], to: 'FORWARDED', permission: 'leave.forward', holderAfter: 'SEKDA' },
  reject:   { from: ['SUBMITTED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'leave.reject', holderAfter: 'DONE' },
};

// Tombol yang boleh tampil per status+permission (dipakai di GET detail)
const ACTION_PERM: Record<string, string> = {
  submit: 'leave.submit', verify: 'leave.verify', revise: 'leave.verify',
  paraf: 'leave.paraf', approve: 'leave.approve', sign: 'leave.sign',
  register: 'leave.register', tobkpsdm: 'leave.register', receiveresult: 'leave.register',
  complete: 'leave.sign', archive: 'leave.register', forward: 'leave.forward', reject: 'leave.reject',
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION'], verify: ['SUBMITTED'], revise: ['SUBMITTED'],
  paraf: ['VERIFIED'], approve: ['PARAF', 'VERIFIED'], sign: ['APPROVED'],
  register: ['SIGNED'], tobkpsdm: ['REGISTERED'], receiveresult: ['SUBMITTED_BKPSDMD'],
  complete: ['FORWARDED'], archive: ['COMPLETED'], forward: ['VERIFIED'],
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
