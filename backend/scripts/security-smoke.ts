/**
 * Smoke test keamanan tanpa DB nyata, tanpa AWS/Supabase.
 * Jalankan: npm run security:smoke
 *
 * Env diset SEBELUM modul aplikasi diimpor (dynamic import). DATABASE_URL
 * diarahkan ke port tertutup agar readiness gagal cepat tanpa menyentuh DB asli.
 * .env lokal sengaja dinetralkan lewat DOTENV_CONFIG_PATH agar hasil deterministik.
 */
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

const UNREACHABLE_DB = 'postgres://u:p@127.0.0.1:1/x';
const NO_DOTENV = path.join(os.tmpdir(), `simpeg-no-dotenv-${process.pid}`);
const VALID_ACCESS = 'a'.repeat(40);
const VALID_REFRESH = 'b'.repeat(40);
const LOGIN_MESSAGE = 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.';

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

// ---------- Mode anak: hanya memuat env (dipakai untuk uji gagal-start JWT) ----------
if (process.argv.includes('--check-env')) {
  import('../src/config/env')
    .then(() => process.exit(0))
    .catch((error) => {
      // Hanya pesan; jangan pernah mencetak nilai secret.
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else {
  void main();
}

type ChildResult = { status: number | null; output: string };

function runEnvChild(overrides: Record<string, string>): ChildResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: UNREACHABLE_DB,
    STORAGE_DRIVER: 'local',
    ALLOW_LOCAL_STORAGE: 'true',
    DOTENV_CONFIG_PATH: NO_DOTENV,
  };
  // Pastikan kasus "tanpa secret" benar-benar kosong.
  delete env.JWT_ACCESS_SECRET;
  delete env.JWT_REFRESH_SECRET;
  Object.assign(env, overrides);

  const result = spawnSync(process.execPath, ['--import', 'tsx', __filename, '--check-env'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function runJwtChecks(): void {
  const empty = runEnvChild({});
  check('JWT kosong = gagal start', empty.status !== 0, `status ${empty.status}`);
  check('JWT kosong: pesan menyebut variabel', /JWT_ACCESS_SECRET/.test(empty.output), empty.output.trim());

  const short = runEnvChild({ JWT_ACCESS_SECRET: 'pendek', JWT_REFRESH_SECRET: VALID_REFRESH });
  check('JWT pendek = gagal start', short.status !== 0, `status ${short.status}`);
  check('JWT pendek: tidak mencetak nilai secret', !short.output.includes('pendek'), short.output.trim());

  const same = runEnvChild({ JWT_ACCESS_SECRET: VALID_ACCESS, JWT_REFRESH_SECRET: VALID_ACCESS });
  check('JWT sama = gagal start', same.status !== 0, `status ${same.status}`);
  check('JWT sama: tidak mencetak nilai secret', !same.output.includes(VALID_ACCESS), same.output.trim());

  const placeholder = runEnvChild({
    JWT_ACCESS_SECRET: 'ganti-ini-min-32-karakter-dev-saja',
    JWT_REFRESH_SECRET: VALID_REFRESH,
  });
  check('JWT placeholder = gagal start', placeholder.status !== 0, `status ${placeholder.status}`);

  const valid = runEnvChild({ JWT_ACCESS_SECRET: VALID_ACCESS, JWT_REFRESH_SECRET: VALID_REFRESH });
  check('JWT valid = start lolos', valid.status === 0, `status ${valid.status}`);
}

async function main(): Promise<void> {
  runJwtChecks();

  process.env.NODE_ENV = 'production';
  process.env.DOTENV_CONFIG_PATH = NO_DOTENV;
  process.env.DATABASE_URL = UNREACHABLE_DB;
  process.env.STORAGE_DRIVER = 'local';
  process.env.ALLOW_LOCAL_STORAGE = 'true';
  process.env.JWT_ACCESS_SECRET = VALID_ACCESS;
  process.env.JWT_REFRESH_SECRET = VALID_REFRESH;
  process.env.CORS_ORIGINS = '';
  process.env.TRUST_PROXY = '';

  const { createApp } = await import('../src/app');
  const { closeDb } = await import('../src/lib/prisma');

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Gagal mendapatkan port uji');
  const base = `http://127.0.0.1:${address.port}`;

  const login = (ip: string | null, username: string, password = 'salah') =>
    fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      body: JSON.stringify({ username, password }),
    });

  try {
    // ---------- (a) health ----------
    const live = await fetch(`${base}/health/live`);
    check('/health/live = 200', live.status === 200, String(live.status));
    check('/health/live punya x-request-id', Boolean(live.headers.get('x-request-id')));
    const echoed = await fetch(`${base}/health/live`, { headers: { 'x-request-id': 'smoke-123' } });
    check('x-request-id dari header dipakai ulang', echoed.headers.get('x-request-id') === 'smoke-123');

    const readyStarted = Date.now();
    const ready = await fetch(`${base}/health/ready`);
    const readyElapsed = Date.now() - readyStarted;
    const readyBody = await ready.text();
    check('/health/ready = 503 saat DB mati', ready.status === 503, String(ready.status));
    check('/health/ready selesai < 5 detik', readyElapsed < 5000, `${readyElapsed} ms`);
    check(
      '/health/ready tidak membocorkan detail error',
      !/ECONNREFUSED|prisma|connect|stack/i.test(readyBody),
      readyBody,
    );

    // ---------- (b) CORS production tanpa allowlist ----------
    const foreign = await fetch(`${base}/health/live`, { headers: { origin: 'https://jahat.example' } });
    check(
      'CORS: origin asing tidak mendapat Access-Control-Allow-Origin',
      foreign.headers.get('access-control-allow-origin') === null,
    );
    const noOrigin = await fetch(`${base}/health/live`);
    check('CORS: tanpa Origin tetap diproses', noOrigin.status === 200);

    // ---------- (c) rate limit login ----------
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      // Password kosong → 422 dari validasi Zod, tanpa menyentuh DB.
      statuses.push((await login(null, 'uji-satu', '')).status);
    }
    check(
      'rate limit: 10 percobaan pertama tidak diblokir',
      statuses.slice(0, 10).every((status) => status === 422),
      statuses.join(','),
    );
    check('rate limit: percobaan ke-11 = 429', statuses[10] === 429, statuses.join(','));

    const blocked = await login(null, 'uji-satu', '');
    const blockedBody = (await blocked.json().catch(() => null)) as
      | { success?: boolean; message?: string; data?: unknown }
      | null;
    check(
      'rate limit: envelope fail + pesan Indonesia',
      blockedBody?.success === false && blockedBody?.message === LOGIN_MESSAGE && blockedBody?.data === null,
      JSON.stringify(blockedBody),
    );

    const otherUser = await login(null, 'uji-dua', '');
    check('rate limit: username lain dari IP sama tidak terkunci', otherUser.status !== 429, String(otherUser.status));

    const otherIp = await login('203.0.113.9', 'uji-satu', '');
    check('rate limit: x-forwarded-for berbeda = kunci berbeda', otherIp.status !== 429, String(otherIp.status));

    // Limiter IP: >100 username berbeda dari satu IP.
    let ipLimited = 0;
    for (let i = 0; i < 101; i += 1) {
      const res = await login('198.51.100.7', `ip-batch-${i}`, '');
      if (res.status === 429) {
        ipLimited += 1;
        break;
      }
    }
    check('rate limit IP: >100 percobaan gagal = 429', ipLimited > 0);

    // 5xx (DB mati) bukan kesalahan pengguna: tidak boleh menghabiskan kuota.
    const serverErrors: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      serverErrors.push((await login(null, 'uji-500', 'salah')).status);
    }
    check(
      'rate limit: 12 respons 500 berturut-turut tidak memicu 429',
      serverErrors.every((status) => status === 500),
      serverErrors.join(','),
    );

    // ---------- (d) body parser ----------
    const badJson = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    check('JSON tidak valid = 400', badJson.status === 400, String(badJson.status));

    const tooLarge = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y', pad: 'a'.repeat(200_000) }),
    });
    check('body terlalu besar = 413', tooLarge.status === 413, String(tooLarge.status));
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await closeDb().catch(() => undefined);
  }

  console.log(`\n${passed} lulus, ${failed} gagal`);
  if (failed > 0) process.exitCode = 1;
}
