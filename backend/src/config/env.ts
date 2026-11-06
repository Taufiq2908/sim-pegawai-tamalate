import 'dotenv/config';
export const env = {
  port: Number(process.env.PORT ?? 3000),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-min-32-chars-xxxx',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-min-32-chars-xxx',
  accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 5_000_000),
  storageDriver: process.env.STORAGE_DRIVER ?? (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local'),
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'simpeg_files',
  apelDeadline: process.env.APEL_DEADLINE_TIME ?? '08:00', // WITA (Asia/Makassar)
  checkoutWeekday: process.env.CHECKOUT_TIME_WEEKDAY ?? '16:00', // Sen-Kam WITA
  checkoutFriday: process.env.CHECKOUT_TIME_FRIDAY ?? '16:30', // Jumat WITA
  pensionBupAge: Number(process.env.PENSION_BUP_AGE ?? 58), // Batas Usia Pensiun PNS
  promotionMinYears: Number(process.env.PROMOTION_MIN_YEARS ?? 4), // Masa jabatan minimal usulan reguler
};
