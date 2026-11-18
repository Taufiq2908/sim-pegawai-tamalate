-- Buku ekspedisi surat keluar + tautan KGB ke surat keluar.
-- Buku ini terpisah dari buku agenda surat keluar dan buku ekspedisi surat masuk.

-- AlterTable
ALTER TABLE "permohonan_kgb" ADD COLUMN "id_surat_keluar" UUID;

-- CreateTable
CREATE TABLE "ekspedisi_surat_keluar" (
    "id" UUID NOT NULL,
    "nomor_registrasi" VARCHAR(40) NOT NULL,
    "id_surat_keluar" UUID NOT NULL,
    "tanggal_kirim" DATE,
    "nama_caraka" VARCHAR(150),
    "nama_penerima" VARCHAR(200) NOT NULL,
    "nomor_tanda_terima" VARCHAR(100),
    "tanggal_diterima" DATE,
    "diterima_oleh_nama" VARCHAR(150),
    "diterima_oleh" UUID,
    "catatan" VARCHAR(500),
    "dibuat_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ekspedisi_surat_keluar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permohonan_kgb_id_surat_keluar_key" ON "permohonan_kgb"("id_surat_keluar");
CREATE UNIQUE INDEX "ekspedisi_surat_keluar_nomor_registrasi_key" ON "ekspedisi_surat_keluar"("nomor_registrasi");
CREATE UNIQUE INDEX "ekspedisi_surat_keluar_id_surat_keluar_key" ON "ekspedisi_surat_keluar"("id_surat_keluar");
CREATE INDEX "ekspedisi_surat_keluar_tanggal_kirim_idx" ON "ekspedisi_surat_keluar"("tanggal_kirim");
CREATE INDEX "ekspedisi_surat_keluar_tanggal_diterima_idx" ON "ekspedisi_surat_keluar"("tanggal_diterima");

-- AddForeignKey
ALTER TABLE "permohonan_kgb" ADD CONSTRAINT "permohonan_kgb_id_surat_keluar_fkey" FOREIGN KEY ("id_surat_keluar") REFERENCES "surat_keluar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ekspedisi_surat_keluar" ADD CONSTRAINT "ekspedisi_surat_keluar_id_surat_keluar_fkey" FOREIGN KEY ("id_surat_keluar") REFERENCES "surat_keluar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ekspedisi_surat_keluar" ADD CONSTRAINT "ekspedisi_surat_keluar_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
