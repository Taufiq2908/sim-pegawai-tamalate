import fs from 'fs';
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";

// Koneksi runtime. Untuk Supabase dipakai pooler :6543 (+ pgbouncer=true);
// untuk RDS tidak ada pgbouncer, jadi DATABASE_URL langsung ke endpoint RDS.
// Migrasi tetap memakai DIRECT_URL lewat prisma.config.ts (Prisma Migrate),
// dan untuk RDS nilai itu memakai ?sslmode=require — bukan lewat pg.Pool.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL belum di-set");

function resolvePoolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  if (!raw) return 10;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`DB_POOL_MAX tidak valid: "${raw}". Gunakan bilangan bulat >= 1.`);
  }
  return value;
}

/**
 * SSL dikontrol env, bukan sslmode di URL: pada pg terbaru `sslmode=require`
 * di connection string berperilaku seperti verify-full dan bisa memutus koneksi.
 * - disable   : tanpa SSL (default, perilaku dev lama)
 * - require   : verifikasi penuh memakai CA bundle RDS dari DATABASE_SSL_CA_FILE
 * - no-verify : enkripsi tanpa verifikasi sertifikat (cadangan darurat)
 */
function resolveSsl(): PoolConfig["ssl"] {
  const mode = (process.env.DATABASE_SSL ?? "disable").trim().toLowerCase();

  if (!mode || mode === "disable") return undefined;

  if (mode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  if (mode === "require") {
    const caFile = process.env.DATABASE_SSL_CA_FILE;
    if (!caFile) {
      throw new Error(
        "DATABASE_SSL=require tetapi DATABASE_SSL_CA_FILE kosong. Isi dengan path CA bundle RDS (mis. /certs/rds-global-bundle.pem).",
      );
    }
    let ca: string;
    try {
      ca = fs.readFileSync(caFile, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`DATABASE_SSL_CA_FILE tidak bisa dibaca (${caFile}): ${detail}`);
    }
    if (!ca.trim()) {
      throw new Error(`DATABASE_SSL_CA_FILE kosong (${caFile}).`);
    }
    return { rejectUnauthorized: true, ca };
  }

  throw new Error(`DATABASE_SSL tidak valid: "${mode}". Nilai yang diizinkan: disable | require | no-verify.`);
}

const pool = new Pool({
  connectionString,
  max: resolvePoolMax(),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  ssl: resolveSsl(),
});
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

/**
 * Tutup koneksi saat graceful shutdown (dipakai T2).
 * `PrismaPg.dispose()` tidak menutup pool eksternal kecuali `disposeExternalPool`
 * diaktifkan, jadi pool.end() memang perlu dipanggil terpisah.
 */
export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
  await pool.end().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!/more than once/i.test(message)) throw error;
  });
}
