import 'dotenv/config';

const DEFAULT_ACCESS_SECRET = 'dev-access-secret-min-32-chars-xxxx';
const DEFAULT_REFRESH_SECRET = 'dev-refresh-secret-min-32-chars-xxx';

/** Nilai default di kode + placeholder di .env.example: tidak boleh dipakai di production. */
const PLACEHOLDER_SECRETS = new Set([
  DEFAULT_ACCESS_SECRET,
  DEFAULT_REFRESH_SECRET,
  'ganti-ini-min-32-karakter-dev-saja',
  'ganti-ini-juga-min-32-karakter-dev-saja',
]);

export const nodeEnv = process.env.NODE_ENV ?? 'development';

/**
 * Production: wajib ada, >= 32 karakter, berbeda satu sama lain, dan bukan
 * placeholder. Pesan error hanya menyebut nama variabel, tidak pernah nilainya.
 * Non-production: perilaku lama (default) + satu warning.
 */
function resolveJwtSecrets(): { accessSecret: string; refreshSecret: string } {
  const accessFromEnv = process.env.JWT_ACCESS_SECRET;
  const refreshFromEnv = process.env.JWT_REFRESH_SECRET;
  const accessSecret = accessFromEnv || DEFAULT_ACCESS_SECRET;
  const refreshSecret = refreshFromEnv || DEFAULT_REFRESH_SECRET;

  if (nodeEnv !== 'production') {
    if (!accessFromEnv || !refreshFromEnv) {
      console.warn(
        '[env] Memakai JWT secret default (khusus development). Set JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET sebelum production.',
      );
    }
    return { accessSecret, refreshSecret };
  }

  const problems: string[] = [];

  if (!accessFromEnv) problems.push('JWT_ACCESS_SECRET wajib di-set');
  else if (accessFromEnv.length < 32) problems.push('JWT_ACCESS_SECRET minimal 32 karakter');
  else if (PLACEHOLDER_SECRETS.has(accessFromEnv)) {
    problems.push('JWT_ACCESS_SECRET masih memakai nilai default/placeholder');
  }

  if (!refreshFromEnv) problems.push('JWT_REFRESH_SECRET wajib di-set');
  else if (refreshFromEnv.length < 32) problems.push('JWT_REFRESH_SECRET minimal 32 karakter');
  else if (PLACEHOLDER_SECRETS.has(refreshFromEnv)) {
    problems.push('JWT_REFRESH_SECRET masih memakai nilai default/placeholder');
  }

  if (accessSecret === refreshSecret) {
    problems.push('JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET tidak boleh sama');
  }

  if (problems.length > 0) {
    throw new Error(`Konfigurasi JWT tidak valid untuk production: ${problems.join('; ')}.`);
  }

  return { accessSecret, refreshSecret };
}

const jwtSecrets = resolveJwtSecrets();

const trustProxyRaw = process.env.TRUST_PROXY;
const trustProxy = (() => {
  if (trustProxyRaw === undefined || trustProxyRaw.trim() === '') {
    return nodeEnv === 'production' ? 1 : 0;
  }
  const value = Number(trustProxyRaw.trim());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`TRUST_PROXY tidak valid: "${trustProxyRaw}". Gunakan bilangan bulat >= 0.`);
  }
  return value;
})();

const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export type StorageDriver = 's3' | 'supabase' | 'local';

const STORAGE_DRIVERS: readonly StorageDriver[] = ['s3', 'supabase', 'local'];

/**
 * Validasi STORAGE_DRIVER secara ketat.
 * - Kosong: perilaku lama (supabase bila terkonfigurasi, selain itu local), tetapi
 *   HANYA di luar production. Di production driver wajib eksplisit.
 * - Nilai di luar s3|supabase|local: selalu error (dulu diam-diam jatuh ke local).
 * - `local` di production ditolak kecuali ALLOW_LOCAL_STORAGE=true.
 */
export function resolveStorageDriver(
  raw: string | undefined,
  supabaseConfigured: boolean,
  nodeEnv: string = process.env.NODE_ENV ?? 'development',
  allowLocal: boolean = process.env.ALLOW_LOCAL_STORAGE === 'true',
): StorageDriver {
  const value = (raw ?? '').trim().toLowerCase();

  if (!value) {
    if (nodeEnv === 'production') {
      throw new Error(
        'STORAGE_DRIVER wajib di-set eksplisit saat NODE_ENV=production (s3 | supabase | local).',
      );
    }
    return supabaseConfigured ? 'supabase' : 'local';
  }

  if (!STORAGE_DRIVERS.includes(value as StorageDriver)) {
    throw new Error(
      `STORAGE_DRIVER tidak valid: "${raw}". Nilai yang diizinkan: s3 | supabase | local.`,
    );
  }

  const driver = value as StorageDriver;

  if (nodeEnv === 'production' && driver === 'local' && !allowLocal) {
    throw new Error(
      'STORAGE_DRIVER=local tidak diizinkan saat NODE_ENV=production karena file akan hilang saat container dibuat ulang. Set ALLOW_LOCAL_STORAGE=true hanya bila memang disengaja.',
    );
  }

  return driver;
}

const storageDriver = resolveStorageDriver(
  process.env.STORAGE_DRIVER,
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
);
const s3Bucket = process.env.S3_BUCKET ?? '';
const awsRegion = process.env.AWS_REGION ?? '';

if (storageDriver === 's3') {
  if (!s3Bucket) {
    throw new Error('STORAGE_DRIVER=s3 tetapi S3_BUCKET kosong. Isi S3_BUCKET dengan nama bucket tujuan.');
  }
  if (!awsRegion) {
    throw new Error('STORAGE_DRIVER=s3 tetapi AWS_REGION kosong. Isi AWS_REGION, mis. ap-southeast-2.');
  }
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv,
  accessSecret: jwtSecrets.accessSecret,
  refreshSecret: jwtSecrets.refreshSecret,
  accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  trustProxy,
  corsOrigins,
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 5_000_000),
  storageDriver,
  s3Bucket,
  awsRegion,
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'simpeg_files',
  apelDeadline: process.env.APEL_DEADLINE_TIME ?? '08:00', // WITA (Asia/Makassar)
  checkoutWeekday: process.env.CHECKOUT_TIME_WEEKDAY ?? '16:00', // Sen-Kam WITA
  checkoutFriday: process.env.CHECKOUT_TIME_FRIDAY ?? '16:30', // Jumat WITA
  pensionBupAge: Number(process.env.PENSION_BUP_AGE ?? 58), // Batas Usia Pensiun PNS
  promotionMinYears: Number(process.env.PROMOTION_MIN_YEARS ?? 4), // Masa jabatan minimal usulan reguler
};
