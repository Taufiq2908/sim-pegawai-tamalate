import 'dotenv/config';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import {
  downloadFromS3Object,
  downloadFromStorage,
  headS3Object,
  isS3StoragePath,
  isSupabaseStoragePath,
  parseStorageObjectUri,
  statSupabaseObject,
} from '../lib/storage';
import { uploadAndVerifyToS3 } from '../lib/upload-verify';
import { documentObjectKey, uploadsRelativePath } from '../lib/migrate-paths';

/**
 * Migrasi berkas SIMPEG -> S3.
 *
 *   node dist/tools/migrate-files-to-s3.js [--dry-run|--apply]
 *
 * Sumber:
 *   - `supabase://<bucket>/<key>`  -> unduh dari Supabase Storage, unggah ke
 *     `s3://S3_BUCKET/<key>` (key SAMA), lalu `jalur_simpan` diperbarui.
 *   - path lokal (`uploads/...`)   -> ambil dari `s3://S3_BUCKET/_migrate/uploads/<rel>`
 *     (diunggah Bos), salin ke key final pola route (`<folder>/<docId><ext>`).
 *
 * PENTING: Supabase HANYA DIBACA. Skrip ini tidak pernah menghapus, mengubah,
 * atau meng-upsert objek/DB Supabase. Semua penulisan hanya ke S3 dan ke kolom
 * `jalur_simpan` di database target (RDS).
 *
 * Mode default `--dry-run`: memeriksa keberadaan sumber (HEAD Supabase / Range
 * 0-0, HeadObject `_migrate/uploads/...`) sehingga angka "akan dipindah/hilang"
 * akurat tanpa menulis apa pun. `--apply` menjalankan pemindahan.
 *
 * Idempoten: baris yang sudah `s3://` dilewati. Keluar non-zero hanya bila ada
 * baris GAGAL (HILANG tidak menggagalkan proses).
 */

type TableName =
  | 'dokumen_cuti'
  | 'dokumen_kgb'
  | 'dokumen_surat_masuk'
  | 'dokumen_surat_keluar'
  | 'dokumen_usulan_pensiun'
  | 'dokumen_usulan_kenaikan_pangkat'
  | 'foto_apel';

const TABLES: readonly TableName[] = [
  'dokumen_cuti',
  'dokumen_kgb',
  'dokumen_surat_masuk',
  'dokumen_surat_keluar',
  'dokumen_usulan_pensiun',
  'dokumen_usulan_kenaikan_pangkat',
  'foto_apel',
];

type DocumentRow = {
  table: TableName;
  id: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string | null;
  originalName: string;
  /** Folder tujuan pola route upload. */
  folder: string;
};

type TableSummary = {
  dipindah: number;
  sudahS3: number;
  hilang: number;
  gagal: number;
};

const missing: Array<{ table: TableName; id: string; storedPath: string; reason: string }> = [];
const failures: Array<{ table: TableName; id: string; storedPath: string; error: string }> = [];
const warnings: string[] = [];

const summary = new Map<TableName, TableSummary>();
for (const table of TABLES) {
  summary.set(table, { dipindah: 0, sudahS3: 0, hilang: 0, gagal: 0 });
}

function bump(table: TableName, key: keyof TableSummary): void {
  const entry = summary.get(table)!;
  entry[key] += 1;
}

function warnSizeMismatch(row: DocumentRow, actualSize: number): void {
  if (row.sizeBytes > 0 && actualSize !== row.sizeBytes) {
    warnings.push(
      `${row.table} ${row.id}: ukuran sumber ${actualSize} != ukuran_byte ${row.sizeBytes} (dibiarkan, hanya peringatan)`,
    );
  }
}

async function loadRows(): Promise<DocumentRow[]> {
  const rows: DocumentRow[] = [];

  const leave = await prisma.leaveDocument.findMany({
    select: {
      id: true,
      leaveRequestId: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
      contentHash: true,
    },
  });
  for (const row of leave) {
    rows.push({
      id: row.id,
      originalName: row.originalName,
      storedPath: row.storedPath,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: row.contentHash,
      table: 'dokumen_cuti',
      folder: `leave/${row.leaveRequestId}`,
    });
  }

  const kgb = await prisma.kgbDocument.findMany({
    select: {
      id: true,
      kgbRequestId: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
      contentHash: true,
    },
  });
  for (const row of kgb) {
    rows.push({
      id: row.id,
      originalName: row.originalName,
      storedPath: row.storedPath,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: row.contentHash,
      table: 'dokumen_kgb',
      folder: `kgb/${row.kgbRequestId}`,
    });
  }

  const incoming = await prisma.letterDocument.findMany({
    select: {
      id: true,
      letterId: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
  for (const row of incoming) {
    rows.push({
      ...row,
      contentHash: null,
      table: 'dokumen_surat_masuk',
      folder: `letters/incoming/${row.letterId}`,
    });
  }

  const outgoing = await prisma.outgoingDocument.findMany({
    select: {
      id: true,
      letterId: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
  for (const row of outgoing) {
    rows.push({
      ...row,
      contentHash: null,
      table: 'dokumen_surat_keluar',
      folder: `letters/outgoing/${row.letterId}`,
    });
  }

  const pension = await prisma.pensionDocument.findMany({
    select: {
      id: true,
      itemId: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
      item: { select: { batchId: true } },
    },
  });
  for (const row of pension) {
    rows.push({
      id: row.id,
      originalName: row.originalName,
      storedPath: row.storedPath,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: null,
      table: 'dokumen_usulan_pensiun',
      folder: `pension/${row.item.batchId}/items/${row.itemId}`,
    });
  }

  const promotion = await prisma.promotionDocument.findMany({
    select: {
      id: true,
      itemId: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
      item: { select: { batchId: true } },
    },
  });
  for (const row of promotion) {
    rows.push({
      id: row.id,
      originalName: row.originalName,
      storedPath: row.storedPath,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: null,
      table: 'dokumen_usulan_kenaikan_pangkat',
      folder: `promotion/${row.item.batchId}/items/${row.itemId}`,
    });
  }

  const photos = await prisma.attendanceSessionPhoto.findMany({
    select: {
      id: true,
      date: true,
      session: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
  for (const row of photos) {
    rows.push({
      id: row.id,
      originalName: row.originalName,
      storedPath: row.storedPath,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: null,
      table: 'foto_apel',
      folder: `attendance/${row.date.toISOString().slice(0, 10)}/${row.session}`,
    });
  }

  return rows;
}

async function updateStoredPath(row: DocumentRow, uri: string): Promise<void> {
  switch (row.table) {
    case 'dokumen_cuti':
      await prisma.leaveDocument.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
    case 'dokumen_kgb':
      await prisma.kgbDocument.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
    case 'dokumen_surat_masuk':
      await prisma.letterDocument.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
    case 'dokumen_surat_keluar':
      await prisma.outgoingDocument.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
    case 'dokumen_usulan_pensiun':
      await prisma.pensionDocument.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
    case 'dokumen_usulan_kenaikan_pangkat':
      await prisma.promotionDocument.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
    case 'foto_apel':
      await prisma.attendanceSessionPhoto.update({ where: { id: row.id }, data: { storedPath: uri } });
      return;
  }
}

async function verifyAndSave(row: DocumentRow, buffer: Buffer, key: string): Promise<string> {
  // Unggah dulu, lalu verifikasi pada bucket/key yang sama. Bila HeadObject
  // gagal 403/5xx, pesannya memuat nama error + kode HTTP asli.
  const uri = await uploadAndVerifyToS3({
    bucket: env.s3Bucket,
    key,
    buffer,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
  });

  await updateStoredPath(row, uri);
  return uri;
}

async function processRow(row: DocumentRow, apply: boolean): Promise<void> {
  if (isS3StoragePath(row.storedPath)) {
    bump(row.table, 'sudahS3');
    return;
  }

  if (isSupabaseStoragePath(row.storedPath)) {
    const parsed = parseStorageObjectUri(row.storedPath);
    if (!parsed) {
      bump(row.table, 'gagal');
      failures.push({
        table: row.table,
        id: row.id,
        storedPath: row.storedPath,
        error: 'format supabase:// tidak terbaca',
      });
      return;
    }

    if (!apply) {
      const stat = await statSupabaseObject(parsed.bucket, parsed.key);
      if (!stat) {
        bump(row.table, 'hilang');
        missing.push({
          table: row.table,
          id: row.id,
          storedPath: row.storedPath,
          reason: 'objek tidak ada di Supabase Storage',
        });
        return;
      }
      warnSizeMismatch(row, stat.size);
      bump(row.table, 'dipindah');
      return;
    }

    const file = await downloadFromStorage(parsed.bucket, parsed.key);
    if (!file) {
      bump(row.table, 'hilang');
      missing.push({
        table: row.table,
        id: row.id,
        storedPath: row.storedPath,
        reason: 'objek tidak ada di Supabase Storage',
      });
      return;
    }
    warnSizeMismatch(row, file.buffer.length);
    const uri = await verifyAndSave(row, file.buffer, parsed.key);
    bump(row.table, 'dipindah');
    console.log(`OK      ${row.table} ${row.id} -> ${uri}`);
    return;
  }

  const rel = uploadsRelativePath(row.storedPath);
  if (!rel) {
    bump(row.table, 'hilang');
    missing.push({
      table: row.table,
      id: row.id,
      storedPath: row.storedPath,
      reason: 'path tidak memuat folder uploads/ sehingga tidak bisa dipetakan',
    });
    return;
  }

  const sourceKey = `_migrate/uploads/${rel}`;
  const sourceHead = await headS3Object(env.s3Bucket, sourceKey);

  if (!apply) {
    if (!sourceHead) {
      bump(row.table, 'hilang');
      missing.push({
        table: row.table,
        id: row.id,
        storedPath: row.storedPath,
        reason: `tidak ada di s3://${env.s3Bucket}/${sourceKey}`,
      });
      return;
    }
    warnSizeMismatch(row, sourceHead.size);
    bump(row.table, 'dipindah');
    return;
  }

  if (!sourceHead) {
    bump(row.table, 'hilang');
    missing.push({
      table: row.table,
      id: row.id,
      storedPath: row.storedPath,
      reason: `tidak ada di s3://${env.s3Bucket}/${sourceKey}`,
    });
    return;
  }

  const file = await downloadFromS3Object(env.s3Bucket, sourceKey);
  if (!file) {
    bump(row.table, 'hilang');
    missing.push({
      table: row.table,
      id: row.id,
      storedPath: row.storedPath,
      reason: `tidak ada di s3://${env.s3Bucket}/${sourceKey}`,
    });
    return;
  }

  warnSizeMismatch(row, file.buffer.length);
  const key = documentObjectKey(row.folder, row.id, row.originalName, row.storedPath);
  const uri = await verifyAndSave(row, file.buffer, key);
  bump(row.table, 'dipindah');
  console.log(`OK      ${row.table} ${row.id} -> ${uri}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--apply' && arg !== '--dry-run');
  if (unknown.length > 0) {
    throw new Error(`Argumen tidak dikenal: ${unknown.join(' ')}. Pakai --dry-run atau --apply.`);
  }
  const apply = args.includes('--apply');
  const mode = apply ? 'apply' : 'dry-run';

  if (!env.s3Bucket) {
    throw new Error('S3_BUCKET kosong; migrasi berkas butuh bucket tujuan S3.');
  }

  console.log(`migrate-files: mode=${mode}, bucket=${env.s3Bucket}`);
  const rows = await loadRows();
  console.log(`migrate-files: ${rows.length} baris dari ${TABLES.length} tabel`);

  for (const row of rows) {
    try {
      await processRow(row, apply);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bump(row.table, 'gagal');
      failures.push({ table: row.table, id: row.id, storedPath: row.storedPath, error: message });
      console.error(`GAGAL   ${row.table} ${row.id}: ${message}`);
    }
  }

  const label = apply ? 'dipindah' : 'akan pindah';
  console.log('');
  console.log(
    `${'tabel'.padEnd(34)} ${label.padStart(11)} ${'sudah s3'.padStart(9)} ${'hilang'.padStart(7)} ${'gagal'.padStart(6)}`,
  );
  for (const table of TABLES) {
    const entry = summary.get(table)!;
    console.log(
      `${table.padEnd(34)} ${String(entry.dipindah).padStart(11)} ${String(entry.sudahS3).padStart(9)} ${String(entry.hilang).padStart(7)} ${String(entry.gagal).padStart(6)}`,
    );
  }

  if (warnings.length > 0) {
    console.log('');
    console.log(`Peringatan ukuran (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (missing.length > 0) {
    console.log('');
    console.log(`Berkas HILANG (${missing.length}) — storedPath tidak diubah:`);
    for (const item of missing) {
      console.log(`  - ${item.table} ${item.id}: ${item.storedPath} (${item.reason})`);
    }
  }

  if (failures.length > 0) {
    console.log('');
    console.log(`Kegagalan (${failures.length}):`);
    for (const failure of failures) {
      console.log(`  - ${failure.table} ${failure.id}: ${failure.storedPath} -> ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`migrate-files GAGAL: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
