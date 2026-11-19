import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';
import {
  deleteStoredFile,
  sendStoredFile,
  storedFileExists,
  storeUploadedFile,
} from '../lib/storage';

/**
 * Uji jalur storage.ts yang dipakai runtime aplikasi terhadap S3 sungguhan
 * (IAM Role instance), dijalankan dari dalam container backend:
 *
 *   node dist/tools/storage-runtime-check.js
 *
 * Alur: tulis file temp di /tmp -> storeUploadedFile (folder `_healthcheck/runtime`)
 * -> storedFileExists -> sendStoredFile (bandingkan SHA-256) -> deleteStoredFile
 * -> storedFileExists harus false. File temp dan objek uji selalu dibersihkan.
 *
 * Catatan folder: `safeFolder('_healthcheck/runtime')` tidak mengubah apa pun;
 * key final adalah `_healthcheck/runtime/<uuid>.txt` dan dicetak di keluaran.
 */

type CapturedResponse = {
  attachment: () => CapturedResponse;
  type: () => CapturedResponse;
  setHeader: () => CapturedResponse;
  send: (chunk: Buffer) => void;
};

async function main(): Promise<void> {
  if (env.storageDriver !== 's3') {
    throw new Error(`STORAGE_DRIVER harus s3 (sekarang ${env.storageDriver}).`);
  }
  if (!env.s3Bucket) {
    throw new Error('S3_BUCKET kosong.');
  }

  const content = Buffer.from(
    `simpeg runtime check ${new Date().toISOString()} ${crypto.randomUUID()}\n`,
  );
  const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'simpeg-runtime-'));
  const tmpFile = path.join(tmpDir, 'runtime-check.txt');
  await fs.promises.writeFile(tmpFile, content);

  let uri = '';
  let deleted = false;
  try {
    uri = await storeUploadedFile(
      {
        path: tmpFile,
        originalname: 'runtime-check.txt',
        mimetype: 'text/plain',
        size: content.length,
      },
      '_healthcheck/runtime',
    );

    console.log(`storage-runtime: key = ${uri}`);

    const expectedPrefix = `s3://${env.s3Bucket}/_healthcheck/runtime/`;
    if (!uri.startsWith(expectedPrefix)) {
      throw new Error(`URI tidak sesuai pola ${expectedPrefix}<uuid>.txt: ${uri}`);
    }

    if (fs.existsSync(tmpFile)) {
      throw new Error('file temp masih ada setelah storeUploadedFile');
    }

    if (!(await storedFileExists(uri))) {
      throw new Error('storedFileExists=false setelah unggah');
    }

    let body: Buffer | null = null;
    const res: CapturedResponse = {
      attachment: () => res,
      type: () => res,
      setHeader: () => res,
      send: (chunk: Buffer) => {
        body = Buffer.from(chunk);
      },
    };

    const sent = await sendStoredFile(
      res as unknown as import('express').Response,
      uri,
      'runtime-check.txt',
      'text/plain',
    );
    if (!sent) {
      throw new Error('sendStoredFile mengembalikan false');
    }
    if (!body) {
      throw new Error('sendStoredFile tidak mengirim body');
    }

    const actualHash = crypto.createHash('sha256').update(body).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`SHA-256 unduhan tidak cocok (${actualHash} != ${expectedHash})`);
    }

    await deleteStoredFile(uri);
    deleted = true;

    if (await storedFileExists(uri)) {
      throw new Error('objek masih ada setelah delete');
    }

    console.log(`LULUS  storage-runtime S3: ${uri}`);
  } finally {
    if (!deleted && uri) {
      await deleteStoredFile(uri).catch(() => undefined);
    }
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`GAGAL  storage-runtime: ${message}`);
  process.exitCode = 1;
});
