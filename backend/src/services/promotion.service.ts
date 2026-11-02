// Aturan alur usulan kenaikan pangkat ASN (SOP 8 langkah).
//
// Satu "batch" = satu berkas/daftar usulan yang dapat berisi beberapa ASN.
// Alur:
//   DRAFT (langkah 1-2: pendataan calon + draf daftar usulan)
//   -> LEGALIZED (langkah 3: berkas lampiran disiapkan + cap/stempel pengesahan)
//   -> VERIFIED (langkah 4: Kasubag verifikasi kelengkapan + legalisasi)
//   -> PARAF (langkah 5: Sekcam verifikasi + paraf)
//   -> APPROVED (langkah 6: Camat verifikasi + tanda tangan)
//   -> REGISTERED (langkah 7: registrasi surat + kirim ke BKPSDM)
//   -> ARCHIVED (langkah 8: arsipkan)
// Ditambah jalur REVISION/REJECTED untuk berkas yang dikembalikan.
import { env } from '../config/env';

export interface PromotionTransition {
  from: string[];
  to: string;
  permission: string;
  holderAfter: string;
}

export const TRANSITIONS: Record<string, PromotionTransition> = {
  legalize: { from: ['DRAFT', 'REVISION'], to: 'LEGALIZED', permission: 'promotion.legalize', holderAfter: 'KASUBAG' },
  verify:   { from: ['LEGALIZED'], to: 'VERIFIED', permission: 'promotion.verify', holderAfter: 'LEADER' },
  revise:   { from: ['LEGALIZED', 'VERIFIED', 'PARAF'], to: 'REVISION', permission: 'promotion.revise', holderAfter: 'VERIFIER' },
  paraf:    { from: ['VERIFIED'], to: 'PARAF', permission: 'promotion.paraf', holderAfter: 'LEADER' },
  approve:  { from: ['PARAF'], to: 'APPROVED', permission: 'promotion.approve', holderAfter: 'VERIFIER' },
  reject:   { from: ['LEGALIZED', 'VERIFIED', 'PARAF'], to: 'REJECTED', permission: 'promotion.reject', holderAfter: 'DONE' },
  register: { from: ['APPROVED'], to: 'REGISTERED', permission: 'promotion.register', holderAfter: 'VERIFIER' },
  archive:  { from: ['REGISTERED'], to: 'ARCHIVED', permission: 'promotion.archive', holderAfter: 'DONE' },
};

const ACTION_PERM: Record<string, string> = {
  legalize: 'promotion.legalize',
  verify: 'promotion.verify',
  revise: 'promotion.revise',
  paraf: 'promotion.paraf',
  approve: 'promotion.approve',
  reject: 'promotion.reject',
  register: 'promotion.register',
  archive: 'promotion.archive',
};

const ACTION_FROM: Record<string, string[]> = {
  legalize: ['DRAFT', 'REVISION'],
  verify: ['LEGALIZED'],
  revise: ['LEGALIZED', 'VERIFIED', 'PARAF'],
  paraf: ['VERIFIED'],
  approve: ['PARAF'],
  reject: ['LEGALIZED', 'VERIFIED', 'PARAF'],
  register: ['APPROVED'],
  archive: ['REGISTERED'],
};

export function availableActions(status: string, perms: string[]): string[] {
  if (perms.includes('*')) {
    return Object.keys(ACTION_FROM).filter((a) => ACTION_FROM[a].includes(status));
  }
  return Object.keys(ACTION_FROM).filter(
    (a) => ACTION_FROM[a].includes(status) && perms.includes(ACTION_PERM[a]),
  );
}

export const PROMOTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draf daftar usulan',
  LEGALIZED: 'Berkas sudah dilegalisasi',
  VERIFIED: 'Berkas terverifikasi Kasubag',
  PARAF: 'Sudah diparaf Sekcam',
  APPROVED: 'Disetujui/ditandatangani Camat',
  REGISTERED: 'Teregistrasi dan dikirim ke BKPSDM',
  ARCHIVED: 'Diarsipkan',
  REVISION: 'Perlu revisi berkas',
  REJECTED: 'Ditolak',
};

export const PROMOTION_ITEM_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu legalisasi',
  LEGALIZED: 'Sudah dilegalisasi',
  VERIFIED: 'Terverifikasi',
  PARAF: 'Sudah diparaf',
  APPROVED: 'Disetujui',
  REGISTERED: 'Teregistrasi',
  ARCHIVED: 'Diarsipkan',
  REVISION: 'Perlu revisi',
  REJECTED: 'Ditolak',
};

export const PROMOTION_ACTION_LABELS: Record<string, string> = {
  legalize: 'dilegalisasi',
  verify: 'diverifikasi',
  revise: 'diminta revisi',
  paraf: 'diparaf',
  approve: 'disetujui/ditandatangani',
  reject: 'ditolak',
  register: 'diregistrasi dan dikirim ke BKPSDM',
  archive: 'diarsipkan',
};

// Checklist dokumen sesuai mutu baku SOP. Verifikasi tetap keputusan petugas
// (human-in-the-loop) melalui checkbox "dokumen lengkap"; sistem tidak memaksa
// semua jenis dokumen harus sudah diunggah.
export const PROMOTION_REQUIRED_DOCS = [
  { code: 'DAFTAR_USUL', label: 'Daftar Usul Mulai Kenaikan Pangkat ASN' },
  { code: 'SK_CPNS', label: 'SK CPNS' },
  { code: 'SK_PNS', label: 'SK PNS/ASN' },
  { code: 'SK_TERAKHIR', label: 'SK Terakhir' },
  { code: 'SKP_3_TAHUN', label: 'SKP 3 Tahun Terakhir' },
  { code: 'KARPEG_NIP_BARU', label: 'Karpeg + NIP Baru' },
  { code: 'IJAZAH_TRANSKRIP', label: 'Ijazah Terakhir + Transkrip Nilai yang Telah Disahkan' },
  { code: 'SK_MUTASI', label: 'SK Mutasi' },
  { code: 'SK_KENAIKAN_PANGKAT_TERAKHIR', label: 'SK Kenaikan Pangkat Terakhir' },
  { code: 'SK_JABATAN_ATASAN', label: 'SK Jabatan Atasan' },
] as const;

export const PROMOTION_REQUIRED_DOC_CODES = PROMOTION_REQUIRED_DOCS.map((d) => d.code);

export const PROMOTION_OTHER_DOC = 'LAINNYA';

export const PROMOTION_DOC_TYPES = [
  ...PROMOTION_REQUIRED_DOC_CODES,
  PROMOTION_OTHER_DOC,
] as const;

export type PromotionDocType = (typeof PROMOTION_DOC_TYPES)[number];

export interface PromotionDocLike {
  id: string;
  docType: string;
  originalName: string;
  createdAt?: Date | string;
}

export function promotionDocChecklist(docs: PromotionDocLike[]) {
  const byType = new Map<string, PromotionDocLike>();
  for (const d of docs) {
    if (!byType.has(d.docType)) byType.set(d.docType, d);
  }
  return PROMOTION_REQUIRED_DOCS.map((d) => {
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

export function missingPromotionDocs(docs: PromotionDocLike[]): string[] {
  const uploaded = new Set(docs.map((d) => d.docType));
  return PROMOTION_REQUIRED_DOCS.filter((d) => !uploaded.has(d.code)).map((d) => d.label);
}

// Urutan golongan PNS/ASN. Dipakai untuk menyarankan golongan berikutnya dan
// memastikan usulan memang naik, bukan turun/sama.
export const RANKS = [
  'I/a', 'I/b', 'I/c', 'I/d',
  'II/a', 'II/b', 'II/c', 'II/d',
  'III/a', 'III/b', 'III/c', 'III/d',
  'IV/a', 'IV/b', 'IV/c', 'IV/d', 'IV/e',
] as const;

const RANK_INDEX = new Map(RANKS.map((rank, index) => [rank.toLowerCase(), index]));

export function normalizeRank(rank: string | null | undefined): string | null {
  if (!rank) return null;
  const key = rank.replace(/\s+/g, '').toLowerCase();
  return RANKS.find((r) => r.toLowerCase() === key) ?? rank.trim();
}

export function rankIndex(rank: string | null | undefined): number | null {
  const normalized = normalizeRank(rank);
  if (!normalized) return null;
  return RANK_INDEX.get(normalized.toLowerCase()) ?? null;
}

export function nextRank(rank: string | null | undefined): string | null {
  const index = rankIndex(rank);
  if (index === null || index >= RANKS.length - 1) return null;
  return RANKS[index + 1];
}

export function isHigherRank(target: string | null | undefined, current: string | null | undefined): boolean | null {
  const targetIndex = rankIndex(target);
  const currentIndex = rankIndex(current);
  if (targetIndex === null || currentIndex === null) return null;
  return targetIndex > currentIndex;
}

/** Tanggal TMT default: tanggal 1 pada bulan periode, atau 1 April bila bulan kosong. */
export function defaultEffectiveDate(periodYear: number, periodMonth: number | null | undefined): Date {
  const month = periodMonth && periodMonth >= 1 && periodMonth <= 12 ? periodMonth : 4;
  return new Date(Date.UTC(periodYear, month - 1, 1));
}

/** Selisih tahun penuh pada tanggal referensi. */
export function computeYearsBetween(from: Date, to: Date): number {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12
    + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, Math.floor(months / 12));
}

export function addYears(date: Date, years: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear() + years,
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

export function promotionPeriodLabel(periodYear: number, periodMonth: number | null): string {
  if (!periodMonth) return `Tahun ${periodYear}`;
  const month = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ][periodMonth - 1] ?? String(periodMonth);
  return `${month} ${periodYear}`;
}

export function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Minimum masa jabatan dalam golongan untuk usulan reguler (default 4 tahun). */
export const PROMOTION_MIN_YEARS = env.promotionMinYears;
