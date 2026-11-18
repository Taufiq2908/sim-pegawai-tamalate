import { prisma } from '../lib/prisma';
import { parseYMD, todayYMD } from './attendance.service';

export const ARCHIVE_SOURCES = ['INCOMING', 'OUTGOING', 'LEAVE'] as const;
export const ARCHIVE_CATEGORIES = ['AKTIF', 'INAKTIF', 'PENTING'] as const;
export const ARCHIVE_LOCATIONS = ['LEMARI_ARSIP', 'GUDANG_ARSIP', 'LURAH'] as const;
export const ARCHIVE_LIST_STATUS = ['DRAFT', 'SIGNED'] as const;

/** Klasifikasi arsip untuk jenis cuti (Permendagri 83/2022). */
const LEAVE_CLASSIFICATION_BY_TYPE: Record<string, string> = {
  TAHUNAN: '800.1.11.4',
  SAKIT: '800.1.11.2',
  MELAHIRKAN: '800.1.11.3',
  ALASAN_PENTING: '800.1.11.5',
};

export type ArchiveSource = (typeof ARCHIVE_SOURCES)[number];
export type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number];
export type ArchiveLocation = (typeof ARCHIVE_LOCATIONS)[number];

/** SOP: aktif -> lemari arsip, tidak aktif -> gudang arsip, penting -> lurah. */
export const LOCATION_BY_CATEGORY: Record<ArchiveCategory, ArchiveLocation> = {
  AKTIF: 'LEMARI_ARSIP',
  INAKTIF: 'GUDANG_ARSIP',
  PENTING: 'LURAH',
};

export class ArchiveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function locationForCategory(category: string): ArchiveLocation {
  return LOCATION_BY_CATEGORY[category as ArchiveCategory] ?? 'LEMARI_ARSIP';
}

function asDate(value: string | undefined | null, field: string): Date | null {
  if (!value) return null;
  const d = parseYMD(value);
  if (!d) throw new ArchiveError(422, `${field} tidak valid (format YYYY-MM-DD)`);
  return d;
}

export async function nextArchiveNumber(tx: any, year: number): Promise<string> {
  const prefix = `ARSIP-${year}-`;
  const count = await tx.archiveRecord.count({ where: { archiveNumber: { startsWith: prefix } } });
  for (let i = count + 1; i <= count + 5000; i++) {
    const candidate = `${prefix}${String(i).padStart(4, '0')}`;
    const exists = await tx.archiveRecord.findUnique({
      where: { archiveNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

export async function nextArchiveListNumber(tx: any, year: number): Promise<string> {
  const prefix = `DAFTAR-ARSIP-${year}-`;
  const count = await tx.archiveList.count({ where: { listNumber: { startsWith: prefix } } });
  for (let i = count + 1; i <= count + 5000; i++) {
    const candidate = `${prefix}${String(i).padStart(4, '0')}`;
    const exists = await tx.archiveList.findUnique({
      where: { listNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

export interface CreateArchiveInput {
  sourceType: ArchiveSource;
  sourceId: string;
  actorId: string;
  classificationCode?: string;
  code?: string;
  bundleCode?: string;
  category?: string;
  archiveDate?: string;
  retentionUntil?: string;
  notes?: string;
  physicalLocation?: string;
  title?: string;
}

/**
 * Langkah 1 + 3 + 4 SOP:
 * - mencatat surat masuk/keluar/cuti ke buku arsip,
 * - mengisi kode arsip/berkas,
 * - menentukan kategori & lokasi simpan.
 * Surat masuk yang masih MENUNGGU_ARSIP ikut dipindahkan ke DIARSIPKAN;
 * surat keluar TERKIRIM ikut dipindahkan ke DIARSIPKAN.
 */
export async function createArchiveRecord(input: CreateArchiveInput) {
  return prisma.$transaction((tx) => createArchiveRecordTx(tx, input));
}

/** Versi transaksi agar bisa digabung dengan perubahan status dokumen sumber. */
export async function createArchiveRecordTx(tx: any, input: CreateArchiveInput) {
  let source: any;
  if (input.sourceType === 'INCOMING') {
    source = await tx.incomingLetter.findUnique({
      where: { id: input.sourceId },
      include: { classification: true, archiveRecord: true },
    });
    if (!source) throw new ArchiveError(404, 'Surat masuk tidak ditemukan');
    if (source.archiveRecord) throw new ArchiveError(409, 'Surat masuk sudah memiliki record arsip');
    if (!['MENUNGGU_ARSIP', 'DIARSIPKAN'].includes(source.status)) {
      throw new ArchiveError(409, `Arsip hanya untuk surat MENUNGGU_ARSIP (saat ini ${source.status})`);
    }
  } else if (input.sourceType === 'OUTGOING') {
    source = await tx.outgoingLetter.findUnique({
      where: { id: input.sourceId },
      include: { classification: true, archiveRecord: true },
    });
    if (!source) throw new ArchiveError(404, 'Surat keluar tidak ditemukan');
    if (source.archiveRecord) throw new ArchiveError(409, 'Surat keluar sudah memiliki record arsip');
    if (source.status !== 'TERKIRIM') {
      throw new ArchiveError(409, `Arsip hanya untuk surat TERKIRIM (saat ini ${source.status})`);
    }
  } else if (input.sourceType === 'LEAVE') {
    source = await tx.leaveRequest.findUnique({
      where: { id: input.sourceId },
      include: { leaveType: true, employee: true, archiveRecord: true },
    });
    if (!source) throw new ArchiveError(404, 'Permohonan cuti tidak ditemukan');
    if (source.archiveRecord) throw new ArchiveError(409, 'Permohonan cuti sudah memiliki record arsip');
    if (!['COMPLETED', 'ARCHIVED'].includes(source.status)) {
      throw new ArchiveError(409, `Arsip cuti hanya untuk pengajuan COMPLETED (saat ini ${source.status})`);
    }
  } else {
    throw new ArchiveError(422, 'Jenis sumber arsip tidak valid');
  }

  let classificationId: string | null = source.classificationId ?? null;
  let classification = source.classification ?? null;
  if (input.classificationCode) {
    classification = await tx.archiveClassification.findUnique({ where: { code: input.classificationCode } });
    if (!classification || !classification.isActive) {
      throw new ArchiveError(422, 'Kode klasifikasi tidak dikenal/aktif');
    }
    classificationId = classification.id;
  } else if (input.sourceType === 'LEAVE') {
    const code = LEAVE_CLASSIFICATION_BY_TYPE[source.leaveType?.code ?? ''];
    if (code) {
      const cls = await tx.archiveClassification.findUnique({ where: { code } });
      if (cls?.isActive) {
        classification = cls;
        classificationId = cls.id;
      }
    }
  }

  const category = (input.category ?? 'AKTIF') as ArchiveCategory;
  if (!ARCHIVE_CATEGORIES.includes(category)) throw new ArchiveError(422, 'Kategori arsip tidak valid');
  const archiveDate = asDate(input.archiveDate, 'archiveDate') ?? parseYMD(todayYMD())!;
  const retentionUntil = asDate(input.retentionUntil, 'retentionUntil');
  if (retentionUntil && retentionUntil < archiveDate) {
    throw new ArchiveError(422, 'retensi tidak boleh sebelum tanggal arsip');
  }

  const isLeave = input.sourceType === 'LEAVE';
  const leaveStart = isLeave ? source.startDate.toISOString().slice(0, 10) : null;
  const leaveEnd = isLeave ? source.endDate.toISOString().slice(0, 10) : null;
  const title = input.title?.trim()
    || (isLeave
      ? `Surat cuti ${source.leaveType?.name ?? 'Cuti'} - ${source.employee?.name ?? source.requestNumber}`
      : source.subject);
  const documentNumber = isLeave ? source.requestNumber : source.letterNumber;
  const documentDate = isLeave ? source.startDate : source.letterDate;
  const notes = input.notes?.trim()
    || (isLeave
      ? `Cuti ${leaveStart} s.d. ${leaveEnd} (${source.totalDays} hari)`
      : null);

  const record = await tx.archiveRecord.create({
    data: {
      archiveNumber: await nextArchiveNumber(tx, archiveDate.getUTCFullYear()),
      sourceType: input.sourceType,
      incomingLetterId: input.sourceType === 'INCOMING' ? source.id : null,
      outgoingLetterId: input.sourceType === 'OUTGOING' ? source.id : null,
      leaveRequestId: isLeave ? source.id : null,
      classificationId,
      code: input.code?.trim() || classification?.code || '000',
      bundleCode: input.bundleCode?.trim() || null,
      title,
      documentNumber,
      documentDate,
      archiveDate,
      category,
      location: locationForCategory(category),
      physicalLocation: input.physicalLocation?.trim() || null,
      retentionUntil,
      notes,
      createdBy: input.actorId,
    },
  });

  if (input.sourceType === 'INCOMING' && source.status !== 'DIARSIPKAN') {
    await tx.incomingLetter.update({
      where: { id: source.id },
      data: { status: 'DIARSIPKAN', archivedAt: new Date() },
    });
  } else if (input.sourceType === 'OUTGOING' && source.status !== 'DIARSIPKAN') {
    await tx.outgoingLetter.update({
      where: { id: source.id },
      data: { status: 'DIARSIPKAN', archivedAt: new Date() },
    });
  } else if (input.sourceType === 'LEAVE' && source.status !== 'ARCHIVED') {
    await tx.leaveRequest.update({
      where: { id: source.id },
      data: { status: 'ARCHIVED', currentHolderRole: 'DONE' },
    });
  }

  return record;
}
