import { prisma } from '../lib/prisma';

// Aturan rantai atasan (docs 06 B3, disepakati user):
// - Staf Subbag Umum → Kasubag Umum & Kepegawaian; Staf Seksi → Kasi seksi tersebut.
// - Kasi/Kasubag → Sekcam. Sekcam/Lurah → Camat. Camat → Sekda (di luar sistem).
// Keterbatasan v1: belum ada master seksi/subbag, sehingga staf kecamatan
// diarahkan ke Kasi pertama yang aktif (fallback Kasubag). Rantai kelurahan
// (Staf → Kasi → Sekretaris Lurah → Lurah) berstatus [BELUM DITENTUKAN] lengkap,
// sehingga resolver mengembalikan direct=null + note.

export interface SupervisorMini {
  id: string;
  username: string;
  name: string;
  nip: string | null;
  position: string | null;
}

export interface SupervisorResult {
  direct: SupervisorMini | null;
  chain: SupervisorMini[];
  note: string | null;
}

function mini(u: any): SupervisorMini {
  return { id: u.id, username: u.username, name: u.employee?.name ?? u.username, nip: u.employee?.nip ?? null, position: u.position };
}

async function activeByPosition(pos: string): Promise<any | null> {
  return prisma.user.findFirst({
    where: { position: pos, isActive: true },
    include: { employee: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function firstActiveByPrefix(prefix: string): Promise<any | null> {
  const users = await prisma.user.findMany({
    where: { position: { startsWith: prefix }, isActive: true },
    include: { employee: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  });
  return users[0] ?? null;
}

// Pemohon yang melewati tahap REVIEWED (pertimbangan atasan diwakili tahap lain
// atau di luar sistem): Camat (→Sekda), Sekcam & Lurah (langsung ke Camat),
// pegawai kelurahan (sementara, menunggu mapping final B3).
export function skipsReviewer(position: string | null, orgType: string | null): boolean {
  const pos = (position ?? '').toUpperCase();
  if (pos === 'CAMAT' || pos === 'SEKCAM' || pos.startsWith('LURAH')) return true;
  if ((orgType ?? '').toUpperCase() === 'KELURAHAN') return true;
  return false;
}

export async function resolveSupervisor(employee: { position: string; orgUnit: { type: string } | null }): Promise<SupervisorResult> {
  const pos = (employee.position ?? '').toUpperCase();
  const orgType = employee.orgUnit?.type ?? null;
  const [camat, sekcam, kasubag, kasi] = await Promise.all([
    activeByPosition('CAMAT'),
    activeByPosition('SEKCAM'),
    firstActiveByPrefix('KASUBAG'),
    firstActiveByPrefix('KASI'),
  ]);

  if (pos === 'CAMAT') {
    return { direct: null, chain: [], note: 'Camat disetujui Sekda (di luar sistem); kecamatan hanya menyiapkan administrasi' };
  }
  if (pos === 'SEKCAM' || pos.startsWith('LURAH')) {
    const chain = [camat].filter(Boolean).map(mini);
    return { direct: camat ? mini(camat) : null, chain, note: null };
  }
  if (pos.startsWith('KASUBAG') || pos.startsWith('KASI')) {
    const chain = [sekcam, camat].filter(Boolean).map(mini);
    return { direct: sekcam ? mini(sekcam) : null, chain, note: null };
  }
  if ((orgType ?? '').toUpperCase() === 'KELURAHAN') {
    return {
      direct: null,
      chain: [],
      note: 'Rantai kelurahan (Staf → Kasi → Sekretaris Lurah → Lurah) belum ditentukan lengkap; sementara Kasubag kecamatan memverifikasi langsung',
    };
  }
  // Staf kecamatan: Kasi (fallback Kasubag bila belum ada Kasi aktif).
  const direct = kasi ?? kasubag;
  const chain = [direct, sekcam, camat].filter(Boolean).map(mini);
  return { direct: direct ? mini(direct) : null, chain, note: null };
}
