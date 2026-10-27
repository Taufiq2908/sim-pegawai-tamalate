-- CreateTable
CREATE TABLE "daftar_arsip" (
    "id" UUID NOT NULL,
    "nomor_daftar" VARCHAR(50) NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "tanggal_akhir" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "keterangan" TEXT,
    "id_penandatangan" UUID,
    "nama_penandatangan" VARCHAR(150),
    "nip_penandatangan" VARCHAR(30),
    "jabatan_penandatangan" VARCHAR(50),
    "ditandatangani_pada" TIMESTAMPTZ,
    "dibuat_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daftar_arsip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arsip" (
    "id" UUID NOT NULL,
    "nomor_arsip" VARCHAR(50) NOT NULL,
    "jenis_sumber" VARCHAR(20) NOT NULL,
    "id_surat_masuk" UUID,
    "id_surat_keluar" UUID,
    "id_klasifikasi" UUID,
    "kode_arsip" VARCHAR(100) NOT NULL,
    "kode_berkas" VARCHAR(100),
    "uraian" VARCHAR(500) NOT NULL,
    "nomor_dokumen" VARCHAR(150),
    "tanggal_dokumen" DATE,
    "tanggal_arsip" DATE NOT NULL,
    "kategori" VARCHAR(20) NOT NULL DEFAULT 'AKTIF',
    "lokasi_simpan" VARCHAR(30) NOT NULL DEFAULT 'LEMARI_ARSIP',
    "retensi_sampai" DATE,
    "keterangan" TEXT,
    "id_daftar_arsip" UUID,
    "dibuat_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "arsip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daftar_arsip_nomor_daftar_key" ON "daftar_arsip"("nomor_daftar");

-- CreateIndex
CREATE INDEX "daftar_arsip_status_tanggal_mulai_idx" ON "daftar_arsip"("status", "tanggal_mulai");

-- CreateIndex
CREATE UNIQUE INDEX "arsip_nomor_arsip_key" ON "arsip"("nomor_arsip");

-- CreateIndex
CREATE UNIQUE INDEX "arsip_id_surat_masuk_key" ON "arsip"("id_surat_masuk");

-- CreateIndex
CREATE UNIQUE INDEX "arsip_id_surat_keluar_key" ON "arsip"("id_surat_keluar");

-- CreateIndex
CREATE INDEX "arsip_jenis_sumber_kategori_idx" ON "arsip"("jenis_sumber", "kategori");

-- CreateIndex
CREATE INDEX "arsip_id_daftar_arsip_idx" ON "arsip"("id_daftar_arsip");

-- CreateIndex
CREATE INDEX "arsip_tanggal_arsip_idx" ON "arsip"("tanggal_arsip");

-- AddForeignKey
ALTER TABLE "daftar_arsip" ADD CONSTRAINT "daftar_arsip_id_penandatangan_fkey" FOREIGN KEY ("id_penandatangan") REFERENCES "pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daftar_arsip" ADD CONSTRAINT "daftar_arsip_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arsip" ADD CONSTRAINT "arsip_id_surat_masuk_fkey" FOREIGN KEY ("id_surat_masuk") REFERENCES "surat_masuk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arsip" ADD CONSTRAINT "arsip_id_surat_keluar_fkey" FOREIGN KEY ("id_surat_keluar") REFERENCES "surat_keluar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arsip" ADD CONSTRAINT "arsip_id_klasifikasi_fkey" FOREIGN KEY ("id_klasifikasi") REFERENCES "klasifikasi_arsip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arsip" ADD CONSTRAINT "arsip_id_daftar_arsip_fkey" FOREIGN KEY ("id_daftar_arsip") REFERENCES "daftar_arsip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arsip" ADD CONSTRAINT "arsip_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
