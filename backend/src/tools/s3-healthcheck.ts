/**
 * Uji S3 dari dalam container backend memakai IAM Role instance
 * (tanpa access key). Dipakai deploy/check.sh.
 *
 * Jalankan: node dist/tools/s3-healthcheck.js
 * Cetak LULUS/GAGAL per langkah, keluar non-zero bila ada yang gagal.
 * Tidak pernah mencetak kredensial.
 */
import crypto from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET ?? '';
const region = process.env.AWS_REGION ?? '';

let failed = 0;

function lulus(message: string): void {
  console.log(`LULUS ${message}`);
}

function gagal(message: string, error?: unknown): void {
  failed += 1;
  let detail = '';
  if (error instanceof Error) {
    detail = ` — ${error.name}: ${error.message}`;
  } else if (error !== undefined) {
    detail = ` — ${String(error)}`;
  }
  console.error(`GAGAL ${message}${detail}`);
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404;
}

async function main(): Promise<void> {
  if (!bucket || !region) {
    gagal('S3_BUCKET/AWS_REGION belum di-set; uji S3 tidak bisa dijalankan');
    process.exit(1);
  }

  const client = new S3Client({ region });
  const key = `_healthcheck/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.bin`;
  const payload = crypto.randomBytes(32);
  const expected = crypto.createHash('sha256').update(payload).digest('hex');
  let uploaded = false;

  const remove = async (): Promise<void> => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  };

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: payload,
        ContentType: 'application/octet-stream',
      }),
    );
    uploaded = true;
    lulus('S3 put');

    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    lulus('S3 head');

    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = object.Body
      ? Buffer.from(await object.Body.transformToByteArray())
      : Buffer.alloc(0);
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual === expected) {
      lulus('S3 get + SHA-256 sama');
    } else {
      gagal('S3 get: SHA-256 berbeda');
    }

    await remove();
    uploaded = false;
    lulus('S3 delete');

    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      gagal('S3 delete: objek uji masih ada');
    } catch (error) {
      if (isNotFound(error)) {
        lulus('S3 delete: objek uji hilang');
      } else {
        gagal('S3 delete: verifikasi gagal', error);
      }
    }
  } catch (error) {
    gagal('alur uji S3', error);
  } finally {
    if (uploaded) {
      // Best-effort: jangan tinggalkan objek uji bila langkah sebelumnya gagal.
      await remove().catch(() => undefined);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log('S3 healthcheck selesai tanpa kegagalan.');
}

void main();
