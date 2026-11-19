/**
 * Smoke test storage tanpa menyentuh AWS/Supabase sama sekali.
 * Jalankan: npm run storage:smoke
 *
 * Env diset SEBELUM modul env/storage diimpor (dynamic import) supaya
 * validasi STORAGE_DRIVER melihat konfigurasi uji, bukan .env lokal.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

function expectThrows(name: string, fn: () => unknown, pattern: RegExp): void {
  try {
    fn();
    check(name, false, 'tidak melempar error');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, pattern.test(message), message);
  }
}

async function main(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simpeg-storage-smoke-'));

  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.STORAGE_DRIVER = 'local';
  process.env.ALLOW_LOCAL_STORAGE = 'true';
  process.env.S3_BUCKET = process.env.S3_BUCKET || 'simpeg-smoke-bucket';
  process.env.AWS_REGION = process.env.AWS_REGION || 'ap-southeast-3';
  process.env.SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'simpeg_files';
  process.env.UPLOAD_DIR = path.join(root, 'uploads');

  const envMod: typeof import('../src/config/env') = await import('../src/config/env');
  const storage: typeof import('../src/lib/storage') = await import('../src/lib/storage');

  try {
    // ---------- 1. Siklus lokal: store -> exists -> download -> delete ----------
    const payload = Buffer.from('dokumen uji SIMPEG Tamalate');
    const sourcePath = path.join(root, 'sumber.pdf');
    fs.writeFileSync(sourcePath, payload);

    const storedPath = await storage.storeUploadedFile(
      { path: sourcePath, originalname: 'Bukti Uji.PDF', mimetype: 'application/pdf', size: payload.length },
      'smoke/2026/11',
    );

    check('store: file temp multer dihapus', !fs.existsSync(sourcePath));
    check('store: file tersimpan di UPLOAD_DIR', fs.existsSync(storedPath), storedPath);
    check(
      'store: nama file UUID + ekstensi asli',
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(storedPath),
      storedPath,
    );
    check('store: path lokal tidak dianggap URI cloud', storage.parseStorageObjectUri(storedPath) === null);

    check('exists: file yang baru ditulis ada', await storage.storedFileExists(storedPath));

    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    let usedDownload = false;
    const fakeRes = {
      attachment(name: string) {
        headers['content-disposition'] = `attachment; filename="${name}"`;
        return this;
      },
      type(value: string) {
        headers['content-type'] = value;
        return this;
      },
      setHeader(name: string, value: string | number) {
        headers[name.toLowerCase()] = String(value);
        return this;
      },
      send(body: Buffer) {
        chunks.push(Buffer.from(body));
        return this;
      },
      download(filePath: string, name: string) {
        usedDownload = true;
        headers['content-disposition'] = `attachment; filename="${name}"`;
        chunks.push(fs.readFileSync(filePath));
        return this;
      },
    } as unknown as import('express').Response;

    const sent = await storage.sendStoredFile(fakeRes, storedPath, 'Bukti Uji.pdf', 'application/pdf');
    check('download: sendStoredFile mengembalikan true', sent);
    check('download: isi byte identik', Buffer.concat(chunks).equals(payload));
    check('download: jalur lokal memakai res.download (perilaku lama)', usedDownload);
    check(
      'download: header attachment memakai nama asli',
      headers['content-disposition']?.includes('Bukti Uji.pdf') === true,
      headers['content-disposition'],
    );

    await storage.deleteStoredFile(storedPath);
    check('delete: file hilang', !(await storage.storedFileExists(storedPath)));
    await storage.deleteStoredFile(storedPath);
    check('delete: aman dipanggil dua kali', true);

    // ---------- 2. Bentuk URI untuk tiga skema ----------
    const key = 'smoke/2026/11/contoh.pdf';
    const s3Uri = storage.storageObjectUri(key, 's3');
    const supabaseUri = storage.storageObjectUri(key, 'supabase');
    const localUri = storage.storageObjectUri(key, 'local');

    check('uri s3: s3://<bucket>/<key>', s3Uri === 's3://simpeg-smoke-bucket/smoke/2026/11/contoh.pdf', s3Uri);
    check(
      'uri supabase: supabase://<bucket>/<key>',
      supabaseUri === 'supabase://simpeg_files/smoke/2026/11/contoh.pdf',
      supabaseUri,
    );
    check(
      'uri lokal: path di UPLOAD_DIR',
      path.resolve(localUri) === path.resolve(path.join(process.env.UPLOAD_DIR!, 'smoke', '2026', '11', 'contoh.pdf')),
      localUri,
    );

    // ---------- 3. Parser tiga skema ----------
    const parsedS3 = storage.parseStorageObjectUri('s3://bucket-a/folder/x.pdf');
    check(
      'parse s3',
      parsedS3?.driver === 's3' && parsedS3.bucket === 'bucket-a' && parsedS3.key === 'folder/x.pdf',
      JSON.stringify(parsedS3),
    );

    const parsedSupabase = storage.parseStorageObjectUri('supabase://simpeg_files/folder/x.pdf');
    check(
      'parse supabase',
      parsedSupabase?.driver === 'supabase' &&
        parsedSupabase.bucket === 'simpeg_files' &&
        parsedSupabase.key === 'folder/x.pdf',
      JSON.stringify(parsedSupabase),
    );

    check('parse: path lokal (POSIX) = null', storage.parseStorageObjectUri('uploads/folder/x.pdf') === null);
    check('parse: path lokal (Windows) = null', storage.parseStorageObjectUri('C:\\simpeg\\uploads\\x.pdf') === null);

    // ---------- 4. Validasi STORAGE_DRIVER ----------
    expectThrows(
      'driver ngawur ditolak',
      () => envMod.resolveStorageDriver('ftp', false, 'development'),
      /tidak valid/,
    );
    check(
      'dev tanpa driver + supabase terkonfigurasi = supabase',
      envMod.resolveStorageDriver(undefined, true, 'development') === 'supabase',
    );
    check('dev tanpa driver = local', envMod.resolveStorageDriver(undefined, false, 'development') === 'local');
    check('nilai case-insensitive', envMod.resolveStorageDriver('S3', false, 'development') === 's3');
    expectThrows(
      'production tanpa driver ditolak',
      () => envMod.resolveStorageDriver(undefined, true, 'production'),
      /wajib di-set/,
    );
    expectThrows(
      'production + local tanpa izin ditolak',
      () => envMod.resolveStorageDriver('local', false, 'production', false),
      /ALLOW_LOCAL_STORAGE/,
    );
    check(
      'production + local dengan ALLOW_LOCAL_STORAGE=true diterima',
      envMod.resolveStorageDriver('local', false, 'production', true) === 'local',
    );
    // ---------- 5. Bucket S3: baca/head/hapus dari storedPath, upload dari env ----------
    // Klien tiruan mencatat Bucket tiap perintah, tanpa jaringan dan tanpa AWS.
    const s3Calls: Array<{ command: string; bucket: unknown; key: unknown }> = [];
    const fakeS3 = {
      async send(command: { constructor: { name: string }; input: { Bucket?: string; Key?: string } }) {
        s3Calls.push({
          command: command.constructor.name,
          bucket: command.input.Bucket,
          key: command.input.Key,
        });
        if (command.constructor.name === 'GetObjectCommand') {
          return {
            Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('isi dari bucket lain')) },
            ContentType: 'application/pdf',
          };
        }
        return {};
      },
    };
    storage.setS3ClientForSmokeTest(fakeS3 as never);

    const otherUri = 's3://bucket-lain/folder/lain.pdf';

    check('s3 exists: memakai bucket dari storedPath', await storage.storedFileExists(otherUri));
    check('s3 exists: Bucket = bucket-lain', s3Calls.at(-1)?.bucket === 'bucket-lain', String(s3Calls.at(-1)?.bucket));

    const s3Chunks: Buffer[] = [];
    const s3Res = {
      attachment() {
        return this;
      },
      type() {
        return this;
      },
      setHeader() {
        return this;
      },
      send(body: Buffer) {
        s3Chunks.push(Buffer.from(body));
        return this;
      },
    } as unknown as import('express').Response;
    check('s3 download: berhasil', await storage.sendStoredFile(s3Res, otherUri, 'lain.pdf', 'application/pdf'));
    check('s3 download: Bucket = bucket-lain', s3Calls.at(-1)?.bucket === 'bucket-lain', String(s3Calls.at(-1)?.bucket));
    check('s3 download: isi byte sesuai', Buffer.concat(s3Chunks).toString() === 'isi dari bucket lain');

    await storage.deleteStoredFile(otherUri);
    check('s3 delete: Bucket = bucket-lain', s3Calls.at(-1)?.bucket === 'bucket-lain', String(s3Calls.at(-1)?.bucket));

    // Upload tetap memakai S3_BUCKET dari env (bukan bucket dari storedPath).
    const previousDriver = envMod.env.storageDriver;
    envMod.env.storageDriver = 's3';
    const uploadSource = path.join(root, 'unggah-s3.pdf');
    fs.writeFileSync(uploadSource, Buffer.from('unggah uji'));
    const uploadedPath = await storage.storeUploadedFile(
      { path: uploadSource, originalname: 'unggah.pdf', mimetype: 'application/pdf', size: 10 },
      'smoke/s3',
    );
    envMod.env.storageDriver = previousDriver;
    check('s3 upload: Bucket = S3_BUCKET env', s3Calls.at(-1)?.bucket === envMod.env.s3Bucket, String(s3Calls.at(-1)?.bucket));
    check(
      's3 upload: storedPath memakai bucket env',
      uploadedPath.startsWith(`s3://${envMod.env.s3Bucket}/`),
      uploadedPath,
    );

    storage.setS3ClientForSmokeTest(null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
