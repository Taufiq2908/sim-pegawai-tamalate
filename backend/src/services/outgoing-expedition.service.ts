import { parseYMD, todayYMD } from './attendance.service';

type Tx = any;

export class OutgoingExpeditionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Buku ekspedisi surat keluar adalah buku tersendiri, terpisah dari buku
 * agenda surat keluar dan buku ekspedisi surat masuk.
 *
 * Satu surat keluar hanya punya satu baris ekspedisi. Baris boleh dibuat
 * lebih awal (mis. otomatis saat registrasi KGB) dengan tanggal kirim kosong,
 * lalu dilengkapi saat surat diserahkan ke caraka, dan akhirnya diisi bukti
 * terima dari instansi tujuan.
 */
export function outgoingExpeditionStatus(row: any): 'BELUM_DICATAT' | 'BELUM_DIKIRIM' | 'DIKIRIM' | 'DITERIMA' {
  if (!row) return 'BELUM_DICATAT';
  if (row.receivedDate) return 'DITERIMA';
  if (row.sentAt) return 'DIKIRIM';
  return 'BELUM_DIKIRIM';
}

function ymd(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function nextRegNumber(tx: Tx, year: number): Promise<string> {
  const prefix = `EXK-${year}-`;
  const last = await tx.outgoingExpedition.findFirst({
    where: { regNumber: { startsWith: prefix } },
    orderBy: { regNumber: 'desc' },
    select: { regNumber: true },
  });
  const lastSeq = last?.regNumber ? Number(last.regNumber.slice(prefix.length)) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Buat baris ekspedisi (idempoten per surat). Tanpa sentDate = belum dikirim. */
export async function ensureOutgoingExpedition(
  tx: Tx,
  opts: {
    letterId: string;
    recipientName: string;
    sentDate?: string | null;
    courierName?: string | null;
    note?: string | null;
    createdBy: string;
  },
) {
  const existing = await tx.outgoingExpedition.findUnique({ where: { letterId: opts.letterId } });
  if (existing) return existing;

  const sentDate = opts.sentDate ? parseYMD(opts.sentDate) : null;
  if (opts.sentDate && !sentDate) throw new OutgoingExpeditionError(422, 'Tanggal kirim tidak valid');
  const year = Number((opts.sentDate ?? todayYMD()).slice(0, 4));

  return tx.outgoingExpedition.create({
    data: {
      regNumber: await nextRegNumber(tx, year),
      letterId: opts.letterId,
      sentAt: sentDate,
      courierName: opts.courierName?.trim() || null,
      recipientName: opts.recipientName.trim(),
      note: opts.note?.trim() || null,
      createdBy: opts.createdBy,
    },
  });
}

/** Langkah 8 SOP: catat penyerahan ke caraka/pengekspedisi. */
export async function markOutgoingExpeditionSent(
  tx: Tx,
  opts: {
    letterId: string;
    recipientName: string;
    sentDate?: string | null;
    courierName?: string | null;
    note?: string | null;
    createdBy: string;
  },
) {
  const sentDateYmd = opts.sentDate || todayYMD();
  const sentDate = parseYMD(sentDateYmd);
  if (!sentDate) throw new OutgoingExpeditionError(422, 'Tanggal kirim tidak valid');

  const existing = await tx.outgoingExpedition.findUnique({ where: { letterId: opts.letterId } });
  if (existing?.receivedDate) {
    throw new OutgoingExpeditionError(409, 'Surat sudah tercatat diterima; data kirim tidak bisa diubah');
  }

  if (!existing) {
    return ensureOutgoingExpedition(tx, {
      letterId: opts.letterId,
      recipientName: opts.recipientName,
      sentDate: sentDateYmd,
      courierName: opts.courierName,
      note: opts.note,
      createdBy: opts.createdBy,
    });
  }

  return tx.outgoingExpedition.update({
    where: { letterId: opts.letterId },
    data: {
      sentAt: sentDate,
      courierName: opts.courierName?.trim() || existing.courierName || null,
      recipientName: opts.recipientName.trim() || existing.recipientName,
      note: opts.note?.trim() || existing.note || null,
    },
  });
}

/** Langkah 9 SOP: bukti terima dari instansi tujuan sudah diterima. */
export async function markOutgoingExpeditionReceived(
  tx: Tx,
  opts: {
    letterId: string;
    recipientName: string;
    receivedDate?: string | null;
    receivedByName: string;
    receiptNumber?: string | null;
    note?: string | null;
    receivedBy: string;
    createdBy: string;
  },
) {
  const receivedDateYmd = opts.receivedDate || todayYMD();
  const receivedDate = parseYMD(receivedDateYmd);
  if (!receivedDate) throw new OutgoingExpeditionError(422, 'Tanggal terima tidak valid');
  if (!opts.receivedByName?.trim()) {
    throw new OutgoingExpeditionError(422, 'Nama penerima bukti terima wajib');
  }

  const existing = await tx.outgoingExpedition.findUnique({ where: { letterId: opts.letterId } });
  if (!existing) {
    // Kompatibilitas data lama: KGB mungkin sudah SUBMITTED_BKPSDMD sebelum
    // tabel ekspedisi keluar ada. Buat baris lengkap agar tetap bisa selesai.
    const created = await ensureOutgoingExpedition(tx, {
      letterId: opts.letterId,
      recipientName: opts.recipientName,
      sentDate: receivedDateYmd,
      courierName: null,
      note: opts.note,
      createdBy: opts.createdBy,
    });
    return tx.outgoingExpedition.update({
      where: { id: created.id },
      data: {
        receivedDate,
        receivedByName: opts.receivedByName.trim(),
        receivedBy: opts.receivedBy,
        receiptNumber: opts.receiptNumber?.trim() || null,
        note: opts.note?.trim() || created.note || null,
      },
    });
  }

  return tx.outgoingExpedition.update({
    where: { letterId: opts.letterId },
    data: {
      sentAt: existing.sentAt ?? receivedDate,
      receivedDate,
      receivedByName: opts.receivedByName.trim(),
      receivedBy: opts.receivedBy,
      receiptNumber: opts.receiptNumber?.trim() || existing.receiptNumber || null,
      note: opts.note?.trim() || existing.note || null,
    },
  });
}

/** Bentuk baris buku ekspedisi untuk API/UI. */
export function publicOutgoingExpedition(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    regNumber: row.regNumber,
    letterId: row.letterId,
    sentDate: ymd(row.sentAt),
    courierName: row.courierName,
    recipientName: row.recipientName,
    receiptNumber: row.receiptNumber,
    receivedDate: ymd(row.receivedDate),
    receivedByName: row.receivedByName,
    note: row.note,
    status: outgoingExpeditionStatus(row),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}
