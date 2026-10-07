// Aturan transisi KGB: action -> {from, to, permission}
export const TRANSITIONS: Record<string, { from: string[]; to: string; permission: string; holderAfter: string }> = {
  submit:   { from: ['DRAFT', 'REVISION'], to: 'SUBMITTED', permission: 'kgb.submit', holderAfter: 'VERIFIER' },
  verify:   { from: ['SUBMITTED'], to: 'VERIFIED', permission: 'kgb.verify', holderAfter: 'LEADER' },
  revise:   { from: ['SUBMITTED'], to: 'REVISION', permission: 'kgb.verify', holderAfter: 'EMPLOYEE' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'kgb.paraf', holderAfter: 'LEADER' },
  approve:  { from: ['PARAF'], to: 'APPROVED', permission: 'kgb.approve', holderAfter: 'LEADER' },
  complete: { from: ['APPROVED'], to: 'COMPLETED', permission: 'kgb.approve', holderAfter: 'DONE' },
  reject:   { from: ['SUBMITTED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'kgb.reject', holderAfter: 'DONE' },
};

const ACTION_PERM: Record<string, string> = {
  submit: 'kgb.submit', verify: 'kgb.verify', revise: 'kgb.verify',
  paraf: 'kgb.paraf', approve: 'kgb.approve',
  complete: 'kgb.approve', reject: 'kgb.reject',
};
const ACTION_FROM: Record<string, string[]> = {
  submit: ['DRAFT', 'REVISION'], verify: ['SUBMITTED'], revise: ['SUBMITTED'],
  paraf: ['VERIFIED'], approve: ['PARAF'],
  complete: ['APPROVED'], reject: ['SUBMITTED', 'VERIFIED', 'PARAF'],
};

export function availableActions(status: string, perms: string[]): string[] {
  if (perms.includes('*')) return Object.keys(ACTION_FROM).filter((a) => ACTION_FROM[a].includes(status));
  return Object.keys(ACTION_FROM).filter(
    (a) => ACTION_FROM[a].includes(status) && perms.includes(ACTION_PERM[a]),
  );
}
