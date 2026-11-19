import path from 'path';

/**
 * Pembantu murni (tanpa I/O) untuk migrasi berkas lokal -> S3.
 * Dipakai `src/tools/migrate-files-to-s3.ts` dan diuji terpisah tanpa DB/AWS.
 */

/** Ekstensi aman: utamakan nama asli, lalu path; huruf kecil, tanpa karakter aneh. */
export function safeExtension(originalName: string, storedPath: string): string {
  const fromName = path.extname(originalName || '').toLowerCase();
  const fromPath = path.extname((storedPath || '').replace(/\\/g, '/')).toLowerCase();
  const ext = fromName || fromPath;
  return ext.replace(/[^.a-z0-9]/g, '').slice(0, 12);
}

/**
 * Bagian path setelah folder `uploads/`.
 * Menangani path relatif (`uploads\\x.pdf`), Linux (`/opt/simpeg/uploads/x.pdf`),
 * dan Windows (`D:\\...\\uploads\\x.pdf`). `null` bila tidak bisa dipetakan dengan aman.
 */
export function uploadsRelativePath(storedPath: string): string | null {
  const normalized = (storedPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const marker = '/uploads/';
  let rel: string | null = null;

  const idx = lower.lastIndexOf(marker);
  if (idx >= 0) {
    rel = normalized.slice(idx + marker.length);
  } else if (lower.startsWith('uploads/')) {
    rel = normalized.slice('uploads/'.length);
  }

  if (!rel) return null;

  const parts = rel.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return parts.join('/');
}

/** Key objek final di S3: `<folder>/<docId><ext>` (pola yang dipakai route upload). */
export function documentObjectKey(
  folder: string,
  docId: string,
  originalName: string,
  storedPath: string,
): string {
  const cleanFolder = folder
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
  const ext = safeExtension(originalName, storedPath);
  return `${cleanFolder}/${docId}${ext}`;
}
