import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { env } from '../src/config/env';
import {
  downloadFromStorage,
  isSupabaseStoragePath,
  storageObjectUri,
  uploadBufferToStorage,
} from '../src/lib/storage';
import { prisma } from '../src/lib/prisma';

type MigratedRow = {
  id: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
};

type Summary = {
  migrated: number;
  skippedAlready: number;
  missing: number;
  failed: number;
  missingFiles: string[];
  failures: Array<{ id: string; storedPath: string; error: string }>;
};

const summary: Summary = {
  migrated: 0,
  skippedAlready: 0,
  missing: 0,
  failed: 0,
  missingFiles: [],
  failures: [],
};

function extensionOf(row: MigratedRow): string {
  const fromName = path.extname(row.originalName || '').toLowerCase();
  const fromPath = path.extname(row.storedPath || '').toLowerCase();
  const ext = fromName || fromPath;
  return ext.replace(/[^.a-z0-9]/g, '').slice(0, 12);
}

async function migrateRow(row: MigratedRow, folder: string, save: (uri: string) => Promise<unknown>): Promise<void> {
  if (isSupabaseStoragePath(row.storedPath)) {
    summary.skippedAlready += 1;
    return;
  }

  const localPath = path.resolve(row.storedPath);
  if (!fs.existsSync(localPath)) {
    summary.missing += 1;
    summary.missingFiles.push(row.storedPath);
    return;
  }

  const key = `${folder}/${row.id}${extensionOf(row)}`;
  try {
    const buffer = await fs.promises.readFile(localPath);
    await uploadBufferToStorage(env.supabaseBucket, key, buffer, row.mimeType);
    const check = await downloadFromStorage(env.supabaseBucket, key);
    if (!check || check.buffer.length !== buffer.length) {
      throw new Error('verifikasi upload gagal (ukuran file tidak sama)');
    }
    await save(storageObjectUri(key));
    summary.migrated += 1;
    console.log(`OK   ${row.id} -> ${storageObjectUri(key)}`);
  } catch (error) {
    summary.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    summary.failures.push({ id: row.id, storedPath: row.storedPath, error: message });
    console.error(`FAIL ${row.id} (${row.storedPath}): ${message}`);
  }
}

async function main(): Promise<void> {
  if (env.storageDriver !== 'supabase') {
    throw new Error(`STORAGE_DRIVER harus supabase untuk migrasi (saat ini ${env.storageDriver})`);
  }

  const leaveDocs = await prisma.leaveDocument.findMany({
    select: { id: true, leaveRequestId: true, originalName: true, storedPath: true, mimeType: true, sizeBytes: true },
  });
  for (const row of leaveDocs) {
    await migrateRow(row, `leave/${row.leaveRequestId}`, (storedPath) =>
      prisma.leaveDocument.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  const kgbDocs = await prisma.kgbDocument.findMany({
    select: { id: true, kgbRequestId: true, originalName: true, storedPath: true, mimeType: true, sizeBytes: true },
  });
  for (const row of kgbDocs) {
    await migrateRow(row, `kgb/${row.kgbRequestId}`, (storedPath) =>
      prisma.kgbDocument.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  const attendancePhotos = await prisma.attendanceSessionPhoto.findMany({
    select: { id: true, date: true, session: true, originalName: true, storedPath: true, mimeType: true, sizeBytes: true },
  });
  for (const row of attendancePhotos) {
    const date = row.date.toISOString().slice(0, 10);
    await migrateRow(row, `attendance/${date}/${row.session}`, (storedPath) =>
      prisma.attendanceSessionPhoto.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  const letterDocs = await prisma.letterDocument.findMany({
    select: { id: true, letterId: true, originalName: true, storedPath: true, mimeType: true, sizeBytes: true },
  });
  for (const row of letterDocs) {
    await migrateRow(row, `letters/incoming/${row.letterId}`, (storedPath) =>
      prisma.letterDocument.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  const outgoingDocs = await prisma.outgoingDocument.findMany({
    select: { id: true, letterId: true, originalName: true, storedPath: true, mimeType: true, sizeBytes: true },
  });
  for (const row of outgoingDocs) {
    await migrateRow(row, `letters/outgoing/${row.letterId}`, (storedPath) =>
      prisma.outgoingDocument.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  const pensionDocs = await prisma.pensionDocument.findMany({
    select: {
      id: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
      item: { select: { id: true, batchId: true } },
    },
  });
  for (const row of pensionDocs) {
    await migrateRow(row, `pension/${row.item.batchId}/items/${row.item.id}`, (storedPath) =>
      prisma.pensionDocument.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  const promotionDocs = await prisma.promotionDocument.findMany({
    select: {
      id: true,
      originalName: true,
      storedPath: true,
      mimeType: true,
      sizeBytes: true,
      item: { select: { id: true, batchId: true } },
    },
  });
  for (const row of promotionDocs) {
    await migrateRow(row, `promotion/${row.item.batchId}/items/${row.item.id}`, (storedPath) =>
      prisma.promotionDocument.update({ where: { id: row.id }, data: { storedPath } }),
    );
  }

  console.log(JSON.stringify({ summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
