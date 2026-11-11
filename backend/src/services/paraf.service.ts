import crypto from 'crypto';
import { prisma } from '../lib/prisma';

export type ParafDocumentType = 'LEAVE' | 'KGB' | 'PENSION' | 'PROMOTION' | 'LETTER';

export interface ParafActorSnapshot {
  userId: string;
  name: string;
  nip?: string | null;
  position?: string | null;
}

export interface RecordParafInput {
  documentType: ParafDocumentType;
  documentId: string;
  documentNumber?: string | null;
  documentVersion: number;
  documentHash: string;
  actor: ParafActorSnapshot;
  action: 'PARAF' | 'APPROVE' | 'RETURN' | 'REJECT';
  note?: string | null;
}

function ymd(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Serialisasi deterministik agar hash tidak berubah karena urutan key. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return 'null';
}

export function hashDocument(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

interface DocumentMini {
  id: string;
  docType: string;
  originalName: string;
  sizeBytes: number;
  contentHash?: string | null;
}

function documentSnapshot(documents: DocumentMini[] = []) {
  return documents
    .map((d) => ({
      id: d.id,
      docType: d.docType,
      name: d.originalName,
      size: d.sizeBytes,
      // Hash isi file dibuat saat upload. Baris lama boleh null.
      contentHash: d.contentHash ?? null,
    }))
    .sort((a, b) => `${a.docType}:${a.id}`.localeCompare(`${b.docType}:${b.id}`));
}

/**
 * Isi dokumen cuti yang di-hash. Status dan timestamp sengaja tidak ikut
 * supaya hash tetap sama saat status berubah, tetapi berubah saat isi/versi
 * dokumen berubah.
 */
export function leaveDocumentPayload(r: any, documents: DocumentMini[] = []) {
  return {
    type: 'LEAVE',
    id: r.id,
    requestNumber: r.requestNumber,
    version: r.version ?? 1,
    employeeId: r.employeeId,
    leaveTypeId: r.leaveTypeId,
    startDate: ymd(r.startDate),
    endDate: ymd(r.endDate),
    totalDays: r.totalDays,
    reason: r.reason,
    addressDuringLeave: r.addressDuringLeave ?? null,
    contactDuringLeave: r.contactDuringLeave ?? null,
    // Surat jawaban BKPSDM datang setelah persetujuan dan bukan bagian naskah
    // yang diparaf; jangan mengubah hash dokumen utama.
    documents: documentSnapshot(documents.filter((d) => d.docType !== 'SURAT_JAWABAN_BKPSDM')),
  };
}

export function kgbDocumentPayload(r: any, documents: DocumentMini[] = []) {
  return {
    type: 'KGB',
    id: r.id,
    requestNumber: r.requestNumber,
    version: r.version ?? 1,
    employeeId: r.employeeId,
    oldRank: r.oldRank,
    newRank: r.newRank,
    oldSalary: r.oldSalary,
    newSalary: r.newSalary,
    effectiveDate: ymd(r.effectiveDate),
    note: r.note ?? null,
    documents: documentSnapshot(documents),
  };
}

export async function recordParaf(tx: any, input: RecordParafInput) {
  return tx.documentParaf.create({
    data: {
      documentType: input.documentType,
      documentId: input.documentId,
      documentNumber: input.documentNumber?.slice(0, 80) ?? null,
      documentVersion: input.documentVersion,
      documentHash: input.documentHash,
      actorUserId: input.actor.userId,
      actorName: input.actor.name.slice(0, 150),
      actorNip: input.actor.nip?.slice(0, 30) ?? null,
      actorPosition: input.actor.position?.slice(0, 50) ?? null,
      action: input.action,
      note: input.note ?? null,
    },
  });
}

export async function listParafHistory(
  documentType: ParafDocumentType,
  documentId: string,
) {
  return prisma.documentParaf.findMany({
    where: { documentType, documentId },
    orderBy: { createdAt: 'asc' },
  });
}

export function publicParafHistory(rows: any[]) {
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    documentVersion: row.documentVersion,
    documentHash: row.documentHash,
    actor: {
      id: row.actorUserId,
      name: row.actorName,
      nip: row.actorNip,
      position: row.actorPosition,
    },
    note: row.note,
    createdAt: row.createdAt,
  }));
}
