// Aturan alur usulan pensiun PNS (SOP 8 langkah).
//
// Satu "batch" = satu berkas/daftar nominatif yang dapat berisi beberapa PNS.
// Alur:
//   DRAFT (langkah 1-2: pendataan BUP + draf daftar nominatif)
//   -> VERIFIED (langkah 3: Kasubag verifikasi kelengkapan)
//   -> PARAF (langkah 4: Sekcam paraf)
//   -> APPROVED (langkah 5: Camat validasi + tanda tangan)
//   -> REGISTERED (langkah 6: catat agenda surat keluar, nomor, stempel)
//   -> EXPEDITED (langkah 7: catat buku ekspedisi, serahkan ke pendistribusi)
//   -> SENT (langkah 8: dikirim ke BKPSDMD + tanda terima)
//   -> COMPLETED / ARCHIVED (opsional, penutupan arsip)
// Ditambah jalur REVISION/REJECTED untuk berkas yang dikembalikan.
import { env } from '../config/env';

export interface PensionTransition {
  from: string[];
  to: string;
  permission: string;
  holderAfter: string;
}

export const TRANSITIONS: Record<string, PensionTransition> = {
  verify:   { from: ['DRAFT', 'REVISION'], to: 'VERIFIED', permission: 'pension.verify', holderAfter: 'LEADER' },
  revise:   { from: ['VERIFIED', 'PARAF'], to: 'REVISION', permission: 'pension.revise', holderAfter: 'KASUBAG' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'pension.paraf', holderAfter: 'LEADER' },
  approve:  { from: ['PARAF'], to: 'APPROVED', permission: 'pension.approve', holderAfter: 'KASUBAG' },
  reject:   { from: ['VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'pension.reject', holderAfter: 'DONE' },
  register: { from: ['APPROVED'], to: 'REGISTERED', permission: 'pension.register', holderAfter: 'KASUBAG' },
  expedite: { from: ['REGISTERED'], to: 'EXPEDITED', permission: 'pension.expedite', holderAfter: 'VERIFIER' },
  send:     { from: ['EXPEDITED'], to: 'SENT', permission: 'pension.send', holderAfter: 'DONE' },
  complete: { from: ['SENT'], to: 'COMPLETED', permission: 'pension.send', holderAfter: 'DONE' },
  archive:  { from: ['COMPLETED'], to: 'ARCHIVED', permission: 'pension.register', holderAfter: 'DONE' },
};

const ACTION_PERM: Record<string, string> = {
  verify: 'pension.verify',
  revise: 'pension.revise',
  paraf: 'pension.paraf',
  approve: 'pension.approve',
  reject: 'pension.reject',
  register: 'pension.register',
  expedite: 'pension.expedite',
  send: 'pension.send',
  complete: 'pension.send',
  archive: 'pension.register',
};

const ACTION_FROM: Record<string, string[]> = {
  verify: ['DRAFT', 'REVISION'],
  revise: ['VERIFIED', 'PARAF'],
  paraf: ['VERIFIED'],
  approve: ['PARAF'],
  reject: ['VERIFIED', 'PARAF'],
  register: ['APPROVED'],
  expedite: ['REGISTERED'],
  send: ['EXPEDITED'],
  complete: ['SENT'],
  archive: ['COMPLETED'],
};

export function availableActions(status: string, perms: string[]): string[] {
  if (perms.includes('*')) {
    return Object.keys(ACTION_FROM).filter((a) => ACTION_FROM[a].includes(status));
  }
  return Object.keys(ACTION_FROM).filter(
    (a) => ACTION_FROM[a].includes(status) && perms.includes(ACTION_PERM[a]),
  );
}

export const PENSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draf daftar usulan',
  VERIFIED: 'Berkas terverifikasi',
  PARAF: 'Sudah diparaf Sekcam',
  APPROVED: 'Disetujui/ditandatangani Camat',
  REGISTERED: 'Tercatat di buku agenda',
  EXPEDITED: 'Tercatat di buku ekspedisi',
  SENT: 'Dikirim ke BKPSDMD',
  COMPLETED: 'Selesai',
  ARCHIVED: 'Diarsipkan',
  REVISION: 'Perlu revisi berkas',
  REJECTED: 'Ditolak',
};

export const PENSION_ACTION_LABELS: Record<string, string> = {
  verify: 'diverifikasi',
  revise: 'diminta revisi',
  paraf: 'diparaf',
  approve: 'disetujui/ditandatangani',
  reject: 'ditolak',
  register: 'dicatat di buku agenda',
  expedite: 'dicatat di buku ekspedisi',
  send: 'dikirim ke BKPSDMD',
  complete: 'diselesaikan',
  archive: 'diarsipkan',
};

// Daftar dokumen yang ditampilkan sebagai checklist pada langkah 3.
// Verifikasi tetap merupakan keputusan petugas (human-in-the-loop) melalui
// checkbox "dokumen lengkap"; sistem tidak memaksa semua jenis dokumen ada.
export const PENSION_REQUIRED_DOCS = [
  { code: 'SK_CPNS', label: 'SK CPNS' },
  { code: 'SK_PNS', label: 'SK PNS' },
  { code: 'SK_PANGKAT_TERAKHIR', label: 'SK Pangkat Terakhir' },
  { code: 'SK_JABATAN_TERAKHIR', label: 'SK Jabatan Terakhir' },
  { code: 'KTP', label: 'KTP' },
  { code: 'KK', label: 'Kartu Keluarga' },
  { code: 'NPWP', label: 'NPWP' },
  { code: 'REKENING_GAJI', label: 'Rekening Gaji' },
  { code: 'PAS_FOTO', label: 'Pas Foto' },
  { code: 'SKP_2_TAHUN', label: 'SKP 2 Tahun Terakhir' },
  { code: 'SURAT_KETERANGAN_SEHAT', label: 'Surat Keterangan Sehat' },
  { code: 'SURAT_PERNYATAAN', label: 'Surat Pernyataan Tidak Bermasalah' },
] as const;

export const PENSION_REQUIRED_DOC_CODES = PENSION_REQUIRED_DOCS.map((d) => d.code);

export const PENSION_OTHER_DOC = 'LAINNYA';

export const PENSION_DOC_TYPES = [
  ...PENSION_REQUIRED_DOC_CODES,
  PENSION_OTHER_DOC,
] as const;

export type PensionDocType = (typeof PENSION_DOC_TYPES)[number];

export const PENSION_TYPES = ['BUP', 'APS', 'UDZUR', 'JANDA', 'DUDA'] as const;
export type PensionType = (typeof PENSION_TYPES)[number];

export interface PensionDocLike {
  id: string;
  docType: string;
  originalName: string;
  createdAt?: Date | string;
}

export function pensionDocChecklist(docs: PensionDocLike[]) {
  const byType = new Map<string, PensionDocLike>();
  for (const d of docs) {
    if (!byType.has(d.docType)) byType.set(d.docType, d);
  }
  return PENSION_REQUIRED_DOCS.map((d) => {
    const uploaded = byType.get(d.code) ?? null;
    return {
      code: d.code,
      label: d.label,
      uploaded: Boolean(uploaded),
      documentId: uploaded?.id ?? null,
      originalName: uploaded?.originalName ?? null,
      uploadedAt: uploaded?.createdAt ?? null,
    };
  });
}

export function missingPensionDocs(docs: PensionDocLike[]): string[] {
  const uploaded = new Set(docs.map((d) => d.docType));
  return PENSION_REQUIRED_DOCS.filter((d) => !uploaded.has(d.code)).map((d) => d.label);
}

/** Tanggal pensiun = tanggal lahir + usia BUP (default 58 tahun). */
export function computeRetirementDate(birthDate: Date, bupAge = env.pensionBupAge): Date {
  return new Date(Date.UTC(
    birthDate.getUTCFullYear() + bupAge,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  ));
}

export function computeAge(birthDate: Date, at = new Date()): { years: number; months: number } {
  let years = at.getUTCFullYear() - birthDate.getUTCFullYear();
  let months = at.getUTCMonth() - birthDate.getUTCMonth();
  if (at.getUTCDate() < birthDate.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

/** Masa kerja dalam tahun penuh pada tanggal referensi (biasanya tanggal pensiun). */
export function computeYearsOfService(joinDate: Date | null, referenceDate: Date): number | null {
  if (!joinDate) return null;
  let months = (referenceDate.getUTCFullYear() - joinDate.getUTCFullYear()) * 12
    + (referenceDate.getUTCMonth() - joinDate.getUTCMonth());
  if (referenceDate.getUTCDate() < joinDate.getUTCDate()) months -= 1;
  return Math.max(0, Math.floor(months / 12));
}

/** Selisih bulan kalender, dipakai untuk menampilkan "berapa bulan lagi". */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12
    + (to.getUTCMonth() - from.getUTCMonth());
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86400000);
}

export function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function pensionPeriodLabel(periodYear: number, periodMonth: number | null): string {
  if (!periodMonth) return `Tahun ${periodYear}`;
  const month = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ][periodMonth - 1] ?? String(periodMonth);
  return `${month} ${periodYear}`;
}
