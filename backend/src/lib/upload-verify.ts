import crypto from 'crypto';
import { headS3Object, uploadBufferToS3Bucket } from './storage';

/**
 * Ulangi satu jalur pemindahan berkas ke S3: PutObject lalu verifikasi HEAD
 * pada **bucket/key yang sama** (satu pasangan parameter dipakai keduanya).
 *
 * Urutan wajib: unggah dulu, baru verifikasi. Pesan "tidak ditemukan setelah
 * unggah" hanya boleh muncul bila PutObject sukses dan HEAD benar-benar 404
 * (NoSuchKey/NotFound). Error lain (mis. AccessDenied 403) diteruskan dengan
 * nama error + kode HTTP aslinya.
 */

export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function describeS3Error(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const err = error as {
    name?: string;
    Code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = err.name || err.Code || 'Error';
  const status = err.$metadata?.httpStatusCode;
  const statusText = status ? ` (HTTP ${status})` : '';
  const detail = err.message && err.message !== name ? `: ${err.message}` : '';
  return `${name}${statusText}${detail}`;
}

export interface UploadVerifyInput {
  bucket: string;
  key: string;
  buffer: Buffer;
  mimeType: string;
  contentHash?: string | null;
}

/** Unggah + verifikasi; mengembalikan URI final `s3://<bucket>/<key>`. */
export async function uploadAndVerifyToS3(input: UploadVerifyInput): Promise<string> {
  const { bucket, key, buffer, mimeType, contentHash } = input;

  try {
    await uploadBufferToS3Bucket(bucket, key, buffer, mimeType);
  } catch (error) {
    throw new Error(`unggah gagal: s3://${bucket}/${key} -> ${describeS3Error(error)}`);
  }

  let head: { size: number } | null;
  try {
    head = await headS3Object(bucket, key);
  } catch (error) {
    throw new Error(`verifikasi gagal: HEAD s3://${bucket}/${key} -> ${describeS3Error(error)}`);
  }

  if (!head) {
    throw new Error(
      `verifikasi gagal: objek s3://${bucket}/${key} tidak ditemukan setelah unggah (HEAD 404)`,
    );
  }

  if (head.size !== buffer.length) {
    throw new Error(
      `verifikasi gagal: ukuran di S3 ${head.size} != ukuran diunggah ${buffer.length} (s3://${bucket}/${key})`,
    );
  }

  if (contentHash && contentHash.trim()) {
    const expected = contentHash.trim().toLowerCase();
    const actual = sha256Hex(buffer);
    if (actual !== expected) {
      throw new Error(`verifikasi gagal: SHA-256 tidak cocok dengan hash_konten (s3://${bucket}/${key})`);
    }
  }

  return `s3://${bucket}/${key}`;
}
