-- AlterTable: form surat masuk
ALTER TABLE "surat_masuk"
ADD COLUMN "jenis_surat" VARCHAR(20) NOT NULL DEFAULT 'BIASA',
ADD COLUMN "diajukan_pada" TIMESTAMPTZ;

-- AlterTable: terima & baca disposisi
ALTER TABLE "disposisi_surat"
ADD COLUMN "diterima_pada" TIMESTAMPTZ;

-- AlterTable: waktu arsip surat keluar
ALTER TABLE "surat_keluar"
ADD COLUMN "diarsipkan_pada" TIMESTAMPTZ;

-- AlterTable: lokasi fisik arsip hardcopy
ALTER TABLE "arsip"
ADD COLUMN "lokasi_fisik" VARCHAR(200);

-- Default status baru
ALTER TABLE "surat_masuk" ALTER COLUMN "status" SET DEFAULT 'DRAFT_TU';
ALTER TABLE "surat_keluar" ALTER COLUMN "status" SET DEFAULT 'TERKIRIM';

-- Migrasi status surat masuk lama ke workflow baru
UPDATE "surat_masuk" SET "status" = 'REVIEW_SEKCAM' WHERE "status" = 'RECEIVED';
UPDATE "surat_masuk" SET "status" = 'DISPOSISI_CAMAT' WHERE "status" = 'PARAF';
UPDATE "surat_masuk" SET "status" = 'DITERUSKAN' WHERE "status" = 'DISPOSED';
UPDATE "surat_masuk" SET "status" = 'MENUNGGU_ARSIP' WHERE "status" = 'COMPLETED';
UPDATE "surat_masuk" SET "status" = 'DIARSIPKAN' WHERE "status" = 'ARCHIVED';

-- Migrasi status surat keluar lama
UPDATE "surat_keluar" SET "status" = 'TERKIRIM' WHERE "status" = 'ISSUED';
UPDATE "surat_keluar"
SET "status" = 'DIARSIPKAN'
WHERE "id" IN (
  SELECT "id_surat_keluar" FROM "arsip" WHERE "id_surat_keluar" IS NOT NULL
);
