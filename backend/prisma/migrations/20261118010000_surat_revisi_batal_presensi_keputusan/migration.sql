-- Surat masuk: revisi Sekcam, pembatalan oleh TU, dan arsip oleh staf.
ALTER TABLE "surat_masuk"
  ADD COLUMN IF NOT EXISTS "catatan_revisi" TEXT,
  ADD COLUMN IF NOT EXISTS "diminta_revisi_pada" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "diminta_revisi_oleh" UUID,
  ADD COLUMN IF NOT EXISTS "alasan_pembatalan" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "dibatalkan_pada" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dibatalkan_oleh" UUID;

-- Presensi: laporan ke Sekcam, keputusan Camat, dan pembinaan Kasi.
ALTER TABLE "surat_teguran"
  ADD COLUMN IF NOT EXISTS "keputusan_camat" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "catatan_keputusan" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "diputuskan_pada" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "diputuskan_oleh" UUID,
  ADD COLUMN IF NOT EXISTS "dibina_oleh" UUID;

-- Data lama yang sudah diinstruksikan Camat dianggap sudah diputuskan tindak lanjut.
UPDATE "surat_teguran"
SET "keputusan_camat" = 'FOLLOW_UP'
WHERE "diinstruksikan_pada" IS NOT NULL
  AND "keputusan_camat" = 'PENDING';

CREATE INDEX IF NOT EXISTS "surat_teguran_keputusan_camat_idx"
  ON "surat_teguran" ("keputusan_camat");
