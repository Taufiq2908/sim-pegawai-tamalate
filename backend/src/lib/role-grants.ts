/**
 * Grant tambahan berbasis jabatan.
 *
 * Role menjamin hak dasar, sedangkan jabatan tertentu membutuhkan grant/deny
 * tambahan agar alur kerja sesuai SOP (mis. Kasubag sebagai pemeriksa, Sekcam
 * hanya memaraf, Camat sebagai penandatangan akhir).
 *
 * Dipakai oleh seed dan endpoint manajemen pengguna supaya akun baru langsung
 * punya hak yang sama dengan akun demo.
 */
export const KASUBAG_GRANTS = [
  'leave.verify',
  'leave.revise',
  'leave.reject',
  'leave.forward',
  'attendance.summary',
  'attendance.manage',
  'kgb.verify',
  'kgb.revise',
  'kgb.reject',
  'kgb.register',
  'kgb.remind',
  'pension.create',
  'pension.document.upload',
  'pension.verify',
  'pension.revise',
  'pension.reject',
  'promotion.verify',
  'promotion.revise',
  'promotion.reject',
] as const;

export interface PositionPermissionPolicy {
  grant: readonly string[];
  deny: readonly string[];
}

/** Kebijakan permission tambahan berdasarkan role + jabatan. */
export function positionPermissionPolicy(
  role: string,
  position: string | null | undefined,
): PositionPermissionPolicy | null {
  const pos = (position ?? '').trim().toUpperCase();

  if (role === 'SUPERVISOR' && pos === 'KASUBAG') {
    return { grant: KASUBAG_GRANTS, deny: [] };
  }

  // Sekcam memaraf, Camat yang menyetujui/menandatangani cuti.
  if (role === 'LEADER' && pos === 'SEKCAM') {
    return { grant: [], deny: ['leave.approve', 'leave.sign'] };
  }
  if (role === 'LEADER' && pos === 'CAMAT') {
    return { grant: ['leave.approve', 'leave.sign'], deny: ['leave.verify'] };
  }

  return null;
}

/** Jabatan awal yang masuk akal saat role dipilih. */
export function defaultPositionForRole(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'ADMIN';
    case 'VERIFIER':
      return 'STAF_KEPEGAWAIAN';
    case 'SUPERVISOR':
      return 'KASUBAG';
    case 'LEADER':
      return 'SEKCAM';
    default:
      return 'STAF';
  }
}
