-- AlterTable
ALTER TABLE "surat_keluar"
ADD COLUMN "ditolak_arsip_pada" TIMESTAMPTZ,
ADD COLUMN "catatan_penolakan_arsip" VARCHAR(1000);
