import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Response as ExpressResponse } from 'express';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env, type StorageDriver } from '../config/env';

export interface UploadedFileLike {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface DownloadedFile {
  buffer: Buffer;
  contentType: string | null;
}

export interface StorageObjectStat {
  size: number;
}

type StorageObjectRef = {
  driver: 's3' | 'supabase';
  bucket: string;
  key: string;
};

const SUPABASE_URI = /^supabase:\/\/([^/]+)\/(.+)$/;
const S3_URI = /^s3:\/\/([^/]+)\/(.+)$/;

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return ext.replace(/[^.a-z0-9]/g, '').slice(0, 12);
}

function safeFolder(folder: string): string {
  return folder
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export function isSupabaseStoragePath(storedPath: string): boolean {
  return SUPABASE_URI.test(storedPath);
}

export function isS3StoragePath(storedPath: string): boolean {
  return S3_URI.test(storedPath);
}

/**
 * Bentuk `storedPath` untuk key tertentu. Driver default = driver tulis aktif,
 * sehingga pemanggil lama (satu argumen) tidak berubah perilakunya.
 */
export function storageObjectUri(key: string, driver: StorageDriver = env.storageDriver): string {
  const clean = safeFolder(key);
  if (driver === 's3') return `s3://${env.s3Bucket}/${clean}`;
  if (driver === 'local') return path.join(env.uploadDir, ...clean.split('/'));
  return `supabase://${env.supabaseBucket}/${clean}`;
}

/**
 * Tentukan driver dari awalan `storedPath`, bukan dari driver aktif.
 * `null` berarti file di filesystem lokal.
 */
export function parseStorageObjectUri(storedPath: string): StorageObjectRef | null {
  const s3 = S3_URI.exec(storedPath);
  if (s3) return { driver: 's3', bucket: s3[1], key: s3[2] };
  const supabase = SUPABASE_URI.exec(storedPath);
  if (supabase) return { driver: 'supabase', bucket: supabase[1], key: supabase[2] };
  return null;
}

function assertSupabaseConfigured(): void {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Supabase Storage belum dikonfigurasi (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env.supabaseUrl)) {
    throw new Error('SUPABASE_URL tidak valid; gunakan https://<project-ref>.supabase.co');
  }
}

function encodedKey(key: string): string {
  return key
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function storageFetch(pathname: string, init: RequestInit = {}): Promise<globalThis.Response> {
  assertSupabaseConfigured();
  return fetch(`${env.supabaseUrl}${pathname}`, {
    ...init,
    headers: {
      apikey: env.supabaseServiceRoleKey,
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Supabase Storage mengembalikan 400 dengan body { statusCode: "404", ... }
 * untuk object yang tidak ada, bukan HTTP 404.
 */
function isStorageNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status !== 400 || !body) return false;
  try {
    const parsed = JSON.parse(body) as { statusCode?: string; error?: string; code?: string };
    return parsed.statusCode === '404' || parsed.error === 'not_found' || parsed.code === 'NoSuchKey';
  } catch {
    return false;
  }
}

export async function uploadBufferToStorage(
  bucket: string,
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const res = await storageFetch(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey(key)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage upload gagal (${res.status})${detail ? `: ${detail}` : ''}`);
  }
}

export async function downloadFromStorage(
  bucket: string,
  key: string,
): Promise<DownloadedFile | null> {
  const res = await storageFetch(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey(key)}`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (isStorageNotFound(res.status, detail)) return null;
    throw new Error(`Supabase Storage download gagal (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type'),
  };
}

export async function deleteFromStorage(bucket: string, key: string): Promise<void> {
  const res = await storageFetch(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey(key)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (isStorageNotFound(res.status, detail)) return;
    throw new Error(`Supabase Storage delete gagal (${res.status})${detail ? `: ${detail}` : ''}`);
  }
}

/**
 * Klien S3 singleton, dibuat lazy. Tanpa kredensial eksplisit: memakai default
 * credential chain (di EC2 = IAM Role instance). Region dari AWS_REGION.
 */
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!env.awsRegion) {
    throw new Error('AWS_REGION belum di-set; klien S3 tidak bisa dibuat.');
  }
  if (!s3Client) {
    s3Client = new S3Client({ region: env.awsRegion });
  }
  return s3Client;
}

/**
 * HANYA UNTUK SMOKE TEST: ganti klien S3 dengan tiruan tanpa jaringan, agar
 * bucket tujuan setiap perintah bisa diperiksa. Tidak dipakai kode produksi.
 */
export function setS3ClientForSmokeTest(client: S3Client | null): void {
  s3Client = client;
}

/**
 * NotFound/NoSuchKey/HTTP 404 dianggap "file tidak ada" (sama seperti Supabase).
 * NoSuchBucket TIDAK dianggap file hilang: itu salah konfigurasi dan harus terlihat.
 */
function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (err.name === 'NoSuchBucket' || err.Code === 'NoSuchBucket') return false;
  if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.Code === 'NoSuchKey') return true;
  return err.$metadata?.httpStatusCode === 404;
}

async function uploadBufferToS3(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (!env.s3Bucket) {
    throw new Error('S3_BUCKET belum di-set; upload S3 tidak bisa dilakukan.');
  }
  await uploadBufferToS3Bucket(env.s3Bucket, key, buffer, mimeType);
}

/** Put objek ke bucket + key eksplisit (dipakai migrasi ke S3). Checksum SHA256. */
export async function uploadBufferToS3Bucket(
  bucket: string,
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      ChecksumAlgorithm: 'SHA256',
    }),
  );
}

// Get/Head/Delete memakai bucket dari storedPath (s3://<bucket>/<key>), bukan
// S3_BUCKET, supaya objek lama di bucket lain tetap terbaca setelah migrasi.
async function downloadFromS3(bucket: string, key: string): Promise<DownloadedFile | null> {
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return { buffer: Buffer.from(bytes), contentType: res.ContentType ?? null };
  } catch (error) {
    if (isS3NotFound(error)) return null;
    throw error;
  }
}

async function deleteFromS3(bucket: string, key: string): Promise<void> {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isS3NotFound(error)) return;
    throw error;
  }
}

async function s3ObjectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isS3NotFound(error)) return false;
    throw error;
  }
}

/** HEAD objek S3; `null` bila objek tidak ada. Dipakai migrasi berkas. */
export async function headS3Object(bucket: string, key: string): Promise<StorageObjectStat | null> {
  try {
    const res = await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: Number(res.ContentLength ?? 0) };
  } catch (error) {
    if (isS3NotFound(error)) return null;
    throw error;
  }
}

/** Unduh objek S3 dengan bucket eksplisit (bucket dari `s3://<bucket>/<key>`). */
export async function downloadFromS3Object(
  bucket: string,
  key: string,
): Promise<DownloadedFile | null> {
  return downloadFromS3(bucket, key);
}

/**
 * Ukuran objek Supabase Storage tanpa mengunduh isi: HEAD, lalu Range 0-0 bila
 * server tidak mengirim Content-Length. `null` bila objek tidak ada.
 */
export async function statSupabaseObject(
  bucket: string,
  key: string,
): Promise<StorageObjectStat | null> {
  const pathname = `/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey(key)}`;
  const head = await storageFetch(pathname, { method: 'HEAD' });
  if (head.status === 404 || head.status === 400) return null;
  if (!head.ok) {
    const detail = await head.text().catch(() => '');
    throw new Error(`Supabase Storage HEAD gagal (${head.status})${detail ? `: ${detail}` : ''}`);
  }

  const length = head.headers.get('content-length');
  if (length && /^\d+$/.test(length)) return { size: Number(length) };

  const range = await storageFetch(pathname, {
    method: 'GET',
    headers: { Range: 'bytes=0-0' },
  });
  if (range.status === 404 || range.status === 400) return null;
  if (!range.ok) {
    const detail = await range.text().catch(() => '');
    throw new Error(`Supabase Storage Range gagal (${range.status})${detail ? `: ${detail}` : ''}`);
  }
  const contentRange = range.headers.get('content-range');
  const match = contentRange ? /\/(\d+)$/.exec(contentRange) : null;
  return { size: match ? Number(match[1]) : 0 };
}

/**
 * Simpan file upload multer: ke storage sesuai STORAGE_DRIVER (s3/supabase),
 * atau ke disk lokal sebagai fallback development.
 */
export async function storeUploadedFile(file: UploadedFileLike, folder: string): Promise<string> {
  const ext = safeExt(file.originalname);
  const key = `${safeFolder(folder)}/${crypto.randomUUID()}${ext}`;

  if (env.storageDriver === 's3') {
    const buffer = await fs.promises.readFile(file.path);
    try {
      await uploadBufferToS3(key, buffer, file.mimetype);
    } finally {
      await fs.promises.rm(file.path, { force: true }).catch(() => undefined);
    }
    return storageObjectUri(key, 's3');
  }

  if (env.storageDriver === 'supabase') {
    const buffer = await fs.promises.readFile(file.path);
    try {
      await uploadBufferToStorage(env.supabaseBucket, key, buffer, file.mimetype);
    } finally {
      await fs.promises.rm(file.path, { force: true }).catch(() => undefined);
    }
    return storageObjectUri(key, 'supabase');
  }

  const target = path.join(env.uploadDir, ...key.split('/'));
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.rename(file.path, target);
  return target;
}

/** Cek keberadaan file tanpa mengunduh isi (lokal: fs.existsSync; cloud: HEAD). */
export async function storedFileExists(storedPath: string): Promise<boolean> {
  const parsed = parseStorageObjectUri(storedPath);
  if (!parsed) return fs.existsSync(storedPath);
  if (parsed.driver === 's3') return s3ObjectExists(parsed.bucket, parsed.key);

  const res = await storageFetch(
    `/storage/v1/object/${encodeURIComponent(parsed.bucket)}/${encodedKey(parsed.key)}`,
    { method: 'HEAD' },
  );
  if (res.status === 404 || res.status === 400) return false;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage HEAD gagal (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return true;
}

/** Kirim file ke response dengan Content-Disposition attachment. */
export async function sendStoredFile(
  res: ExpressResponse,
  storedPath: string,
  originalName: string,
  mimeType: string,
): Promise<boolean> {
  const parsed = parseStorageObjectUri(storedPath);
  if (!parsed) {
    if (!fs.existsSync(storedPath)) return false;
    res.download(storedPath, originalName);
    return true;
  }

  const file =
    parsed.driver === 's3'
      ? await downloadFromS3(parsed.bucket, parsed.key)
      : await downloadFromStorage(parsed.bucket, parsed.key);
  if (!file) return false;
  res.attachment(originalName);
  res.type(mimeType || file.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', file.buffer.length);
  res.send(file.buffer);
  return true;
}

/** Hapus file dari storage; aman untuk file yang sudah tidak ada. */
export async function deleteStoredFile(storedPath: string): Promise<void> {
  const parsed = parseStorageObjectUri(storedPath);
  if (!parsed) {
    fs.rmSync(storedPath, { force: true });
    return;
  }
  if (parsed.driver === 's3') {
    await deleteFromS3(parsed.bucket, parsed.key);
    return;
  }
  await deleteFromStorage(parsed.bucket, parsed.key);
}

/** Hash isi file upload sebelum dipindahkan ke storage permanen. */
export async function hashFileAtPath(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Hapus file temporary multer (selalu lokal), dipakai saat validasi gagal. */
export function discardTempFile(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* best-effort */
  }
}
