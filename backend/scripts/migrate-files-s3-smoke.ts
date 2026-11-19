import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Uji klien S3 tiruan untuk jalur `--apply` migrasi berkas:
 * PutObject dan HeadObject HARUS memakai bucket/key yang sama, dan pesan galat
 * HEAD non-404 harus memuat nama error + kode HTTP aslinya.
 *
 * Jalankan: npx tsx scripts/migrate-files-s3-smoke.ts
 */

let checks = 0;

function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function eq<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  checks += 1;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

type CommandLike = { constructor: { name: string }; input: Record<string, any> };
type Call = { name: string; bucket?: string; key?: string; size?: number };

async function expectError(
  name: string,
  run: () => Promise<unknown>,
  contains: string[],
): Promise<string> {
  let failed = false;
  let message = '';
  try {
    await run();
  } catch (error) {
    failed = true;
    message = error instanceof Error ? error.message : String(error);
  }
  ok(failed, `${name}: harus gagal`);
  for (const part of contains) {
    ok(message.includes(part), `${name}: pesan harus memuat "${part}" (didapat: ${message})`);
  }
  return message;
}

async function main(): Promise<void> {
  // Env harus di-set SEBELUM modul storage dievaluasi.
  process.env.NODE_ENV = 'development';
  process.env.STORAGE_DRIVER = 's3';
  process.env.S3_BUCKET = 'bucket-uji';
  process.env.AWS_REGION = 'ap-southeast-2';

  /* eslint-disable @typescript-eslint/no-var-requires */
  const storage = require('../src/lib/storage') as typeof import('../src/lib/storage');
  const { uploadAndVerifyToS3, describeS3Error } =
    require('../src/lib/upload-verify') as typeof import('../src/lib/upload-verify');

  const calls: Call[] = [];
  const objects = new Map<string, number>();
  let headMode: 'ok' | 'missing' | 'forbidden' | 'wrong-size' = 'ok';

  const fakeClient = {
    async send(command: CommandLike) {
      const name = command.constructor.name;
      const input = command.input;
      calls.push({
        name,
        bucket: input.Bucket,
        key: input.Key,
        size: input.Body ? input.Body.length : undefined,
      });

      if (name === 'PutObjectCommand') {
        objects.set(`${input.Bucket}/${input.Key}`, input.Body.length);
        return {};
      }

      if (name === 'HeadObjectCommand') {
        if (headMode === 'forbidden') {
          const error = Object.assign(new Error('Access Denied'), {
            name: 'AccessDenied',
            $metadata: { httpStatusCode: 403 },
          });
          throw error;
        }
        if (headMode === 'missing') {
          const error = Object.assign(new Error('Not Found'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
          });
          throw error;
        }
        const size = objects.get(`${input.Bucket}/${input.Key}`);
        if (size === undefined) throw new Error(`objek tidak ada di klien tiruan: ${input.Key}`);
        return { ContentLength: headMode === 'wrong-size' ? size + 1 : size };
      }

      throw new Error(`perintah S3 tak terduga: ${name}`);
    },
  };

  storage.setS3ClientForSmokeTest(fakeClient as never);

  try {
    // ---------- 1. Sukses: Put & Head harus bucket/key identik ----------
    const buffer = Buffer.from('isi-uji-migrasi-berkas');
    calls.length = 0;
    const uri = await uploadAndVerifyToS3({
      bucket: 'bucket-uji',
      key: 'leave/req-1/doc-1.pdf',
      buffer,
      mimeType: 'application/pdf',
      contentHash: sha256(buffer),
    });

    eq(uri, 's3://bucket-uji/leave/req-1/doc-1.pdf', 'URI hasil memakai bucket/key yang sama');
    const puts = calls.filter((call) => call.name === 'PutObjectCommand');
    const heads = calls.filter((call) => call.name === 'HeadObjectCommand');
    eq(puts.length, 1, 'tepat satu PutObject');
    eq(heads.length, 1, 'tepat satu HeadObject');
    eq(puts[0].bucket, 'bucket-uji', 'bucket PutObject');
    eq(puts[0].key, 'leave/req-1/doc-1.pdf', 'key PutObject');
    eq(heads[0].bucket, puts[0].bucket, 'bucket HEAD sama dengan bucket PUT');
    eq(heads[0].key, puts[0].key, 'key HEAD sama dengan key PUT');
    eq(calls[0].name, 'PutObjectCommand', 'unggah terjadi sebelum verifikasi');
    eq(calls[1].name, 'HeadObjectCommand', 'verifikasi setelah unggah');

    // ---------- 2. HEAD 403 bukan "tidak ditemukan" ----------
    headMode = 'forbidden';
    calls.length = 0;
    const forbiddenMessage = await expectError(
      'HEAD AccessDenied',
      () =>
        uploadAndVerifyToS3({
          bucket: 'bucket-uji',
          key: 'kgb/req-2/doc-2.pdf',
          buffer,
          mimeType: 'application/pdf',
        }),
      ['verifikasi gagal: HEAD', 'AccessDenied', 'HTTP 403'],
    );
    ok(!forbiddenMessage.includes('tidak ditemukan setelah unggah'), '403 tidak dilaporkan hilang');
    ok(
      calls.some((call) => call.name === 'PutObjectCommand') &&
        calls.findIndex((call) => call.name === 'PutObjectCommand') <
          calls.findIndex((call) => call.name === 'HeadObjectCommand'),
      '403 terjadi setelah PutObject sukses',
    );

    // ---------- 3. HEAD 404 setelah unggah sukses ----------
    headMode = 'missing';
    calls.length = 0;
    await expectError(
      'HEAD 404',
      () =>
        uploadAndVerifyToS3({
          bucket: 'bucket-uji',
          key: 'attendance/2026-11-19/pagi/doc-3.jpg',
          buffer,
          mimeType: 'image/jpeg',
        }),
      ['tidak ditemukan setelah unggah', 'HEAD 404', 's3://bucket-uji/attendance/2026-11-19/pagi/doc-3.jpg'],
    );
    ok(
      calls.findIndex((call) => call.name === 'PutObjectCommand') <
        calls.findIndex((call) => call.name === 'HeadObjectCommand'),
      '404 diverifikasi setelah PutObject sukses',
    );

    // ---------- 4. Ukuran HEAD tidak sama ----------
    headMode = 'wrong-size';
    await expectError(
      'ukuran beda',
      () =>
        uploadAndVerifyToS3({
          bucket: 'bucket-uji',
          key: 'kgb/req-3/doc-4.pdf',
          buffer,
          mimeType: 'application/pdf',
        }),
      ['ukuran di S3'],
    );

    // ---------- 5. SHA-256 tidak cocok ----------
    headMode = 'ok';
    await expectError(
      'hash beda',
      () =>
        uploadAndVerifyToS3({
          bucket: 'bucket-uji',
          key: 'leave/req-4/doc-5.pdf',
          buffer,
          mimeType: 'application/pdf',
          contentHash: 'deadbeef',
        }),
      ['SHA-256 tidak cocok'],
    );

    // ---------- 6. describeS3Error memuat nama + kode HTTP ----------
    const described = describeS3Error(
      Object.assign(new Error('Forbidden'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    );
    ok(described.includes('AccessDenied'), 'describeS3Error memuat nama error');
    ok(described.includes('HTTP 403'), 'describeS3Error memuat kode HTTP');

    // ---------- 7. safeFolder tidak mengubah prefix _healthcheck/runtime ----------
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'simpeg-smoke-'));
    const tmpFile = path.join(tmpDir, 'runtime-check.txt');
    await fs.promises.writeFile(tmpFile, buffer);
    try {
      calls.length = 0;
      const runtimeUri = await storage.storeUploadedFile(
        {
          path: tmpFile,
          originalname: 'runtime-check.txt',
          mimetype: 'text/plain',
          size: buffer.length,
        },
        '_healthcheck/runtime',
      );
      const runtimePut = calls.find((call) => call.name === 'PutObjectCommand');
      ok(Boolean(runtimePut), 'storeUploadedFile memanggil PutObject');
      ok(
        Boolean(runtimePut?.key?.startsWith('_healthcheck/runtime/')),
        `key tetap berprefix _healthcheck/runtime/ (didapat: ${runtimePut?.key})`,
      );
      eq(runtimeUri, `s3://bucket-uji/${runtimePut?.key}`, 'storedPath memakai key yang diunggah');
      ok(!fs.existsSync(tmpFile), 'file temp terhapus setelah storeUploadedFile');
      console.log(`contoh key runtime: ${runtimePut?.key}`);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  } finally {
    storage.setS3ClientForSmokeTest(null);
  }

  console.log(`OK ${checks} asersi migrasi-berkas S3 (klien tiruan).`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`GAGAL uji migrasi-berkas S3: ${message}`);
  process.exitCode = 1;
});
