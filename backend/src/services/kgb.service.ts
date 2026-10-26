// Aturan transisi KGB: action -> {from, to, permission}
// Rantai KGB (SOP 9 langkah):
// DRAFT → SUBMITTED → VERIFIED → PARAF → APPROVED → REGISTERED →
// SUBMITTED_BKPSDMD → COMPLETED → ARCHIVED
// (+REVISION/REJECTED)
export const TRANSITIONS: Record<string, { from: string[]; to: string; permission: string; holderAfter: string }> = {
  submit:   { from: ['DRAFT', 'REVISION'], to: 'SUBMITTED', permission: 'kgb.submit', holderAfter: 'VERIFIER' },
  verify:   { from: ['SUBMITTED'], to: 'VERIFIED', permission: 'kgb.verify', holderAfter: 'LEADER' },
  revise:   { from: ['SUBMITTED'], to: 'REVISION', permission: 'kgb.verify', holderAfter: 'EMPLOYEE' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'kgb.paraf', holderAfter: 'LEADER' },
  approve:  { from: ['PARAF'], to: 'APPROVED', permission: 'kgb.approve', holderAfter: 'LEADER' },
  register: { from: ['APPROVED'], to: 'REGISTERED', permission: 'kgb.register', holderAfter: 'VERIFIER' },
  tobkpsdm: { from: ['REGISTERED'], to: 'SUBMITTED_BKPSDMD', permission: 'kgb.register', holderAfter: 'VERIFIER' },
  complete: { from: ['SUBMITTED_BKPSDMD'], to: 'COMPLETED', permission: 'kgb.register', holderAfter: 'DONE' },
  archive:  { from: ['COMPLETED'], to: 'ARCHIVED', permission: 'kgb.register', holderAfter: 'DONE' },
  reject:   { from: ['SUBMITTED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'kgb.reject', holderAfter: 'DONE' },
};

const ACTION_PERM: Record<string, string> = {
  submit: 'kgb.submit', verify: 'kgb.verify', revise: 'kgb.verify',
  paraf: 'kgb.paraf', approve: 'kgb.approve',
  register: 'kgb.register', tobkpsdm: 'kgb.register', complete: 'kgb.register',
  archive: 'kgb.register', reject: 'kgb.reject',
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION'], verify: ['SUBMITTED'], revise: ['SUBMITTED'],
  paraf: ['VERIFIED'], approve: ['PARAF'],
  register: ['APPROVED'], tobkpsdm: ['REGISTERED'], complete: ['SUBMITTED_BKPSDMD'],
  archive: ['COMPLETED'], reject: ['SUBMITTED', 'VERIFIED', 'PARAF'],
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
