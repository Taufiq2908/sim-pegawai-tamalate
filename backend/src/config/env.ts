import 'dotenv/config';
export const env = {
  port: Number(process.env.PORT ?? 3000),
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-min-32-chars-xxxx',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-min-32-chars-xxx',
  accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 5_000_000),
  apelDeadline: process.env.APEL_DEADLINE_TIME ?? '08:00', // WITA (Asia/Makassar)
  checkoutWeekday: process.env.CHECKOUT_TIME_WEEKDAY ?? '16:00', // Sen-Kam WITA
  checkoutFriday: process.env.CHECKOUT_TIME_FRIDAY ?? '16:30', // Jumat WITA
};
