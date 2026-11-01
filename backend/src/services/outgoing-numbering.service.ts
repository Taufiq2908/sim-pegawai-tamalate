import { parseYMD } from './attendance.service';

/**
 * Penomoran surat keluar per tahun.
 *
 * Aturan backdate:
 * - Saat tanggal surat berganti (hari/sesi penomoran berakhir), 3 nomor setelah
 *   nomor terakhir pada tanggal lama dikunci sebagai buffer.
 * - Tanggal baru mulai dari nomor setelah 3 buffer tersebut.
 * - Surat menyusul (backdate) memakai buffer tanggal lama; kalau buffer habis,
 *   permintaan ditolak dan operator harus memakai tanggal berjalan.
 */
export const BACKDATE_BUFFER_SIZE = 3;

export class NumberingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Tx = any;

export interface SequenceAllocation {
  sequence: number;
  bufferId?: string;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function allocateSameDate(tx: Tx, row: any, date: Date): Promise<SequenceAllocation> {
  const sequence = row.lastNumber + 1;
  await tx.numberingSequence.update({
    where: { year: row.year },
    data: { lastNumber: sequence, lastDate: date },
  });
  return { sequence };
}

/**
 * Alokasikan nomor urut surat keluar. Harus dipanggil di dalam transaksi yang
 * sama dengan pembuatan surat agar buffer dan nomor tidak berubah sendiri.
 */
export async function allocateOutgoingSequence(
  tx: Tx,
  letterDateYmd: string,
  bufferSize = BACKDATE_BUFFER_SIZE,
): Promise<SequenceAllocation> {
  const date = parseYMD(letterDateYmd);
  if (!date) throw new NumberingError(422, 'Tanggal surat tidak valid');
  const year = date.getUTCFullYear();

  let row = await tx.numberingSequence.findUnique({ where: { year } });
  if (!row) {
    // Tabel urutan sebelumnya belum dipakai. Inisialisasi dari surat yang sudah
    // ada agar deploy tidak mengulang nomor lama.
    const agg = await tx.outgoingLetter.aggregate({
      where: { year },
      _max: { sequenceNumber: true, letterDate: true },
    });
    row = await tx.numberingSequence.create({
      data: {
        year,
        lastNumber: agg._max.sequenceNumber ?? 0,
        lastDate: agg._max.letterDate ?? null,
      },
    });
  }
  if (!row.lastDate) {
    const sequence = row.lastNumber + 1;
    await tx.numberingSequence.update({
      where: { year },
      data: { lastNumber: sequence, lastDate: date },
    });
    return { sequence };
  }

  const lastDate = new Date(row.lastDate);
  const cmp = date.getTime() - lastDate.getTime();

  if (cmp === 0) return allocateSameDate(tx, row, date);

  if (cmp < 0) {
    // Backdate: hanya boleh memakai buffer yang sudah disiapkan untuk tanggal itu.
    const buffer = await tx.numberingBuffer.findFirst({
      where: { year, letterDate: date, usedAt: null },
      orderBy: { sequenceNumber: 'asc' },
    });
    if (!buffer) {
      throw new NumberingError(
        409,
        `Buffer nomor backdate untuk ${letterDateYmd} tidak tersedia/habis`,
      );
    }
    return { sequence: buffer.sequenceNumber, bufferId: buffer.id };
  }

  // Tanggal baru: kunci 3 nomor setelah nomor terakhir tanggal lama (sekali saja).
  const existingBuffer = await tx.numberingBuffer.findFirst({
    where: { year, letterDate: lastDate },
    select: { id: true },
  });

  let sequence: number;
  if (existingBuffer) {
    sequence = row.lastNumber + 1;
    await tx.numberingSequence.update({
      where: { year },
      data: { lastNumber: sequence, lastDate: date },
    });
  } else {
    const bufferStart = row.lastNumber + 1;
    await tx.numberingBuffer.createMany({
      data: Array.from({ length: bufferSize }, (_, i) => ({
        year,
        letterDate: lastDate,
        sequenceNumber: bufferStart + i,
      })),
    });
    sequence = bufferStart + bufferSize;
    await tx.numberingSequence.update({
      where: { year },
      data: { lastNumber: sequence, lastDate: date },
    });
  }

  return { sequence };
}

/** Tandai nomor buffer sudah dipakai oleh surat yang baru dibuat. */
export async function claimOutgoingBuffer(
  tx: Tx,
  bufferId: string | undefined,
  letterId: string,
): Promise<void> {
  if (!bufferId) return;
  const updated = await tx.numberingBuffer.updateMany({
    where: { id: bufferId, usedAt: null },
    data: { usedAt: new Date(), usedByLetterId: letterId },
  });
  if (updated.count !== 1) {
    throw new NumberingError(409, 'Buffer nomor backdate sudah dipakai, ulangi');
  }
}

export async function getNumberingStatus(tx: Tx, year: number) {
  const [sequence, buffers] = await Promise.all([
    tx.numberingSequence.findUnique({ where: { year } }),
    tx.numberingBuffer.findMany({
      where: { year },
      orderBy: [{ letterDate: 'desc' }, { sequenceNumber: 'asc' }],
      take: 300,
    }),
  ]);
  return {
    year,
    lastNumber: sequence?.lastNumber ?? 0,
    lastDate: sequence?.lastDate ? dateOnly(sequence.lastDate) : null,
    bufferSize: BACKDATE_BUFFER_SIZE,
    buffers: buffers.map((b: any) => ({
      id: b.id,
      letterDate: dateOnly(b.letterDate),
      sequenceNumber: b.sequenceNumber,
      usedAt: b.usedAt,
      usedByLetterId: b.usedByLetterId,
    })),
  };
}
