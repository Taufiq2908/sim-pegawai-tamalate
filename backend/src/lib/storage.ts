import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Response as ExpressResponse } from 'express';
import { env } from '../config/env';

export interface UploadedFileLike {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

interface DownloadedFile {
  buffer: Buffer;
  contentType: string | null;
}

const SUPABASE_URI = /^supabase:\/\/([^/]+)\/(.+)$/;

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

export function storageObjectUri(key: string): string {
  return `supabase://${env.supabaseBucket}/${safeFolder(key)}`;
}

export function parseStorageObjectUri(storedPath: string): { bucket: string; key: string } | null {
  const match = SUPABASE_URI.exec(storedPath);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
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
 * Simpan file upload multer: ke Supabase Storage bila driver aktif,
 * atau ke disk lokal sebagai fallback development.
 */
export async function storeUploadedFile(file: UploadedFileLike, folder: string): Promise<string> {
  const ext = safeExt(file.originalname);
  const key = `${safeFolder(folder)}/${crypto.randomUUID()}${ext}`;

  if (env.storageDriver === 'supabase') {
    const buffer = await fs.promises.readFile(file.path);
    try {
      await uploadBufferToStorage(env.supabaseBucket, key, buffer, file.mimetype);
    } finally {
      await fs.promises.rm(file.path, { force: true }).catch(() => undefined);
    }
    return storageObjectUri(key);
  }

  const target = path.join(env.uploadDir, ...key.split('/'));
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.rename(file.path, target);
  return target;
}

/** Cek keberadaan file tanpa mengunduh isi (lokal: fs.existsSync; Supabase: HEAD). */
export async function storedFileExists(storedPath: string): Promise<boolean> {
  const parsed = parseStorageObjectUri(storedPath);
  if (!parsed) return fs.existsSync(storedPath);

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

  const file = await downloadFromStorage(parsed.bucket, parsed.key);
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
