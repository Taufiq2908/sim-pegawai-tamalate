import { createApp } from './app';
import { env } from './config/env';
import { closeDb } from './lib/prisma';

const app = createApp();
const server = app.listen(env.port, () => console.log(`SIMPEG backend listening on :${env.port}`));

// Di belakang Caddy: beri ruang untuk koneksi keep-alive.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} diterima, menghentikan server...`);

  // Pemaksa: bila koneksi menggantung, jangan menunggu selamanya.
  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown melewati 10 detik, paksa keluar.');
    process.exit(1);
  }, 10_000);

  server.close(async (closeError) => {
    try {
      await closeDb();
    } catch (error) {
      console.error('Gagal menutup koneksi database:', error);
      process.exit(1);
    }
    // Timer pemaksa baru dimatikan setelah DB selesai ditutup, supaya
    // closeDb() yang menggantung tetap dibatasi 10 detik.
    clearTimeout(forceExit);
    if (closeError) {
      console.error('Gagal menutup server:', closeError);
      process.exit(1);
    }
    process.exit(0);
  });
  // Tutup koneksi idle lebih dulu agar server.close() tidak menunggu keep-alive.
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
