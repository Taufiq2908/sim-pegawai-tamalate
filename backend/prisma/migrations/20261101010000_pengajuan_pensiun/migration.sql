-- Modul usulan pensiun PNS (SOP 8 langkah).
-- Satu baris usulan_pensiun = satu berkas/daftar nominatif; item_usulan_pensiun
-- berisi PNS yang diusulkan. Dokumen dan riwayat aksi disimpan per item/berkas.

CREATE TABLE "usulan_pensiun" (
    "id" UUID NOT NULL,
    "nomor_usulan" VARCHAR(50) NOT NULL,
    "tahun_usulan" INTEGER NOT NULL,
    "bulan_usulan" INTEGER,
    "usia_bup" INTEGER NOT NULL DEFAULT 58,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "peran_pemegang_saat_ini" VARCHAR(20),
    "catatan" TEXT,
    "catatan_verifikasi" TEXT,
    "catatan_paraf" TEXT,
    "catatan_persetujuan" TEXT,
    "catatan_revisi" TEXT,
    "alasan_penolakan" TEXT,
    "id_surat_keluar" UUID,
    "nomor_surat_keluar" VARCHAR(150),
    "tanggal_surat_keluar" DATE,
    "nomor_agenda" VARCHAR(50),
    "dicap_pada" TIMESTAMPTZ,
    "nomor_ekspedisi" VARCHAR(50),
    "tanggal_ekspedisi" DATE,
    "nama_kurir" VARCHAR(150),
    "catatan_ekspedisi" TEXT,
    "nomor_tanda_terima" VARCHAR(100),
    "tanggal_tanda_terima" DATE,
    "diterima_oleh" VARCHAR(150),
    "catatan_pengiriman" TEXT,
    "diajukan_pada" TIMESTAMPTZ,
    "diverifikasi_pada" TIMESTAMPTZ,
    "diparaf_pada" TIMESTAMPTZ,
    "disetujui_pada" TIMESTAMPTZ,
    "diregistrasi_pada" TIMESTAMPTZ,
    "diekspedisi_pada" TIMESTAMPTZ,
    "dikirim_pada" TIMESTAMPTZ,
    "selesai_pada" TIMESTAMPTZ,
    "diarsipkan_pada" TIMESTAMPTZ,
    "dibuat_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usulan_pensiun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "item_usulan_pensiun" (
    "id" UUID NOT NULL,
    "id_usulan" UUID NOT NULL,
    "id_pegawai" UUID NOT NULL,
    "nama_pegawai" VARCHAR(150) NOT NULL,
    "nip" VARCHAR(30),
    "nomor_pegawai" VARCHAR(30) NOT NULL,
    "golongan" VARCHAR(20),
    "jabatan" VARCHAR(50) NOT NULL,
    "unit_kerja" VARCHAR(150),
    "tanggal_lahir" DATE NOT NULL,
    "tanggal_pensiun" DATE NOT NULL,
    "usia_bup" INTEGER NOT NULL,
    "masa_kerja_tahun" INTEGER,
    "jenis_pensiun" VARCHAR(20) NOT NULL DEFAULT 'BUP',
    "status_item" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "catatan" TEXT,
    "diverifikasi_pada" TIMESTAMPTZ,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diperbarui_pada" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "item_usulan_pensiun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dokumen_usulan_pensiun" (
    "id" UUID NOT NULL,
    "id_item" UUID NOT NULL,
    "tipe_dokumen" VARCHAR(50) NOT NULL,
    "nama_asli" VARCHAR(255) NOT NULL,
    "jalur_simpan" VARCHAR(500) NOT NULL,
    "tipe_mime" VARCHAR(100) NOT NULL,
    "ukuran_byte" INTEGER NOT NULL,
    "diunggah_oleh" UUID NOT NULL,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dokumen_usulan_pensiun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "persetujuan_usulan_pensiun" (
    "id" UUID NOT NULL,
    "id_usulan" UUID NOT NULL,
    "id_aktor" UUID NOT NULL,
    "peran_aktor" VARCHAR(20) NOT NULL,
    "jabatan_aktor" VARCHAR(50),
    "dari_status" VARCHAR(20) NOT NULL,
    "ke_status" VARCHAR(20) NOT NULL,
    "aksi" VARCHAR(20) NOT NULL,
    "catatan" TEXT,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persetujuan_usulan_pensiun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usulan_pensiun_nomor_usulan_key" ON "usulan_pensiun"("nomor_usulan");
CREATE UNIQUE INDEX "usulan_pensiun_id_surat_keluar_key" ON "usulan_pensiun"("id_surat_keluar");
CREATE INDEX "usulan_pensiun_status_tahun_usulan_idx" ON "usulan_pensiun"("status", "tahun_usulan");
CREATE UNIQUE INDEX "item_usulan_pensiun_id_usulan_id_pegawai_key" ON "item_usulan_pensiun"("id_usulan", "id_pegawai");
CREATE INDEX "item_usulan_pensiun_id_pegawai_status_item_idx" ON "item_usulan_pensiun"("id_pegawai", "status_item");
CREATE INDEX "dokumen_usulan_pensiun_id_item_tipe_dokumen_idx" ON "dokumen_usulan_pensiun"("id_item", "tipe_dokumen");
CREATE INDEX "persetujuan_usulan_pensiun_id_usulan_idx" ON "persetujuan_usulan_pensiun"("id_usulan");

ALTER TABLE "usulan_pensiun" ADD CONSTRAINT "usulan_pensiun_id_surat_keluar_fkey" FOREIGN KEY ("id_surat_keluar") REFERENCES "surat_keluar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usulan_pensiun" ADD CONSTRAINT "usulan_pensiun_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_usulan_pensiun" ADD CONSTRAINT "item_usulan_pensiun_id_usulan_fkey" FOREIGN KEY ("id_usulan") REFERENCES "usulan_pensiun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_usulan_pensiun" ADD CONSTRAINT "item_usulan_pensiun_id_pegawai_fkey" FOREIGN KEY ("id_pegawai") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dokumen_usulan_pensiun" ADD CONSTRAINT "dokumen_usulan_pensiun_id_item_fkey" FOREIGN KEY ("id_item") REFERENCES "item_usulan_pensiun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dokumen_usulan_pensiun" ADD CONSTRAINT "dokumen_usulan_pensiun_diunggah_oleh_fkey" FOREIGN KEY ("diunggah_oleh") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persetujuan_usulan_pensiun" ADD CONSTRAINT "persetujuan_usulan_pensiun_id_usulan_fkey" FOREIGN KEY ("id_usulan") REFERENCES "usulan_pensiun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "persetujuan_usulan_pensiun" ADD CONSTRAINT "persetujuan_usulan_pensiun_id_aktor_fkey" FOREIGN KEY ("id_aktor") REFERENCES "pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
