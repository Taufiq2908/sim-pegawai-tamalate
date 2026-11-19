import crypto from 'crypto';
import express from 'express';
import 'express-async-errors'; // rejection async → error middleware (anti-crash, lihat bawah)
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import leaveRoutes from './routes/leave.routes';
import attendanceRoutes from './routes/attendance.routes';
import letterRoutes from './routes/letter.routes';
import kgbRoutes from './routes/kgb.routes';
import outgoingRoutes from './routes/outgoing.routes';
import archiveRoutes from './routes/archive.routes';
import pensionRoutes from './routes/pension.routes';
import promotionRoutes from './routes/promotion.routes';
import notificationRoutes from './routes/notification.routes';
import employeeRoutes from './routes/employee.routes';
import userRoutes from './routes/user.routes';
import { prisma } from './lib/prisma';
import { env } from './config/env';
import { ok, fail } from './utils/response';

/** Batas waktu health check DB agar readiness tidak menggantung. */
const READY_TIMEOUT_MS = 2000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout setelah ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Request ID: pakai header masuk bila bentuknya aman, selain itu generate baru. */
function requestId(req: any, res: any, next: any) {
  const incoming = req.headers?.['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id =
    typeof candidate === 'string' && /^[\w.:-]{1,128}$/.test(candidate) ? candidate : crypto.randomUUID();
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/** Petakan error ke status + pesan envelope. 500 selalu generik. */
function mapError(err: any): { status: number; message: string } {
  if (!err || typeof err !== 'object') return { status: 500, message: 'Internal server error' };

  const type = typeof err.type === 'string' ? err.type : '';
  const code = typeof err.code === 'string' ? err.code : '';

  if (type === 'entity.parse.failed') return { status: 400, message: 'Body JSON tidak valid' };
  if (
    type === 'entity.too.large' ||
    code === 'LIMIT_FILE_SIZE' ||
    /entity too large/i.test(String(err.message ?? ''))
  ) {
    return { status: 413, message: 'Ukuran file/body terlalu besar' };
  }

  const status = Number(err.status ?? err.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return {
      status,
      message: typeof err.message === 'string' && err.message ? err.message : 'Permintaan tidak valid',
    };
  }

  return { status: 500, message: 'Internal server error' };
}

export function createApp() {
  const app = express();
  // Rantai Caddy -> Next.js -> Express: req.ip harus IP klien dari X-Forwarded-For.
  app.set('trust proxy', env.trustProxy);
  app.use(helmet());
  app.use(
    cors({
      // Tanpa header Origin (server-ke-server / same-origin) selalu lolos.
      // Origin asing hanya diizinkan bila terdaftar; production tanpa allowlist = tolak.
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.corsOrigins.length > 0) return callback(null, env.corsOrigins.includes(origin));
        return callback(null, env.nodeEnv !== 'production');
      },
    }),
  );
  app.use(express.json());
  app.use(requestId);
  app.use(
    env.nodeEnv === 'production'
      ? morgan((tokens, req, res) =>
          JSON.stringify({
            id: res.locals.requestId ?? null,
            method: tokens.method(req, res),
            // Query string dibuang: berpotensi memuat token/secret.
            url: ((req as any).originalUrl || req.url || '').split('?')[0],
            status: Number(tokens.status(req, res)),
            responseTimeMs: Number(tokens['response-time'](req, res)),
            contentLength: tokens.res(req, res, 'content-length') ?? null,
          }),
        )
      : morgan('dev'),
  );

  app.get('/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));
  app.get('/health/live', (_req, res) => ok(res, { status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, READY_TIMEOUT_MS);
      return ok(res, { status: 'ready' });
    } catch (error) {
      // Detail error hanya di log server, tidak di respons.
      console.error('health/ready gagal:', error);
      return fail(res, 503, 'Database belum siap');
    }
  });
  app.get('/api/v1/leave-types', async (_req, res) => {
    const items = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    return res.json({ success: true, message: 'ok', data: items, meta: null, errors: null });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/leave-requests', leaveRoutes);
  app.use('/api/v1/attendances', attendanceRoutes);
  app.use('/api/v1/letters', letterRoutes);
  app.use('/api/v1/kgb-requests', kgbRoutes);
  app.use('/api/v1/outgoing-letters', outgoingRoutes);
  app.use('/api/v1/archives', archiveRoutes);
  app.use('/api/v1/pension-requests', pensionRoutes);
  app.use('/api/v1/promotion-requests', promotionRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/employees', employeeRoutes);
  app.use('/api/v1/users', userRoutes);

  // 404 & error handler
  app.use((req, res) => res.status(404).json({ success: false, message: `Not found: ${req.path}`, data: null, meta: null, errors: null }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: any, res: any, _next: any) => {
    // Log lengkap (termasuk stack) hanya di server; respons 500 tetap generik.
    console.error(`[${res.locals?.requestId ?? '-'}]`, err);
    if (res.headersSent) return;
    const mapped = mapError(err);
    return fail(res, mapped.status, mapped.message);
  });
  return app;
}

// Pengaman lapis terakhir: satu query DB gagal (mis. timeout Supabase di WiFi
// kantor) TIDAK boleh membunuh proses. Error async sudah diteruskan ke
// middleware 500 via express-async-errors; handler ini hanya me-log.
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection (proses tetap hidup):', reason);
});
