-- Surat keluar: atribut tambahan untuk buku agenda & kode surat dinamis
ALTER TABLE "surat_keluar" ADD COLUMN "nomor_tujuan" VARCHAR(100);
ALTER TABLE "surat_keluar" ADD COLUMN "penanggung_jawab" VARCHAR(150);
ALTER TABLE "surat_keluar" ADD COLUMN "kode_surat" VARCHAR(30);
ALTER TABLE "surat_keluar" ADD COLUMN "keterangan" VARCHAR(500);
CREATE INDEX "surat_keluar_tanggal_surat_idx" ON "surat_keluar"("tanggal_surat");

-- Surat masuk: agenda kegiatan pimpinan
ALTER TABLE "surat_masuk" ADD COLUMN "tanggal_kegiatan" DATE;
ALTER TABLE "surat_masuk" ADD COLUMN "waktu_mulai" VARCHAR(5);
ALTER TABLE "surat_masuk" ADD COLUMN "waktu_selesai" VARCHAR(5);
ALTER TABLE "surat_masuk" ADD COLUMN "tempat_kegiatan" VARCHAR(200);
CREATE INDEX "surat_masuk_tanggal_kegiatan_idx" ON "surat_masuk"("tanggal_kegiatan");

-- Penomoran: tanggal terakhir + buffer 3 nomor
ALTER TABLE "urutan_penomoran" ADD COLUMN "tanggal_terakhir" DATE;

-- Inisialisasi urutan dari surat keluar yang sudah ada. Tabel urutan lama
-- belum dipakai oleh route sehingga tanpa backfill nomor bisa terulang.
INSERT INTO "urutan_penomoran" ("tahun", "nomor_terakhir", "tanggal_terakhir", "diperbarui_pada")
SELECT "tahun", MAX("nomor_urut"), MAX("tanggal_surat"), CURRENT_TIMESTAMP
FROM "surat_keluar"
GROUP BY "tahun"
ON CONFLICT ("tahun") DO UPDATE SET
    "nomor_terakhir" = GREATEST("urutan_penomoran"."nomor_terakhir", EXCLUDED."nomor_terakhir"),
    "tanggal_terakhir" = GREATEST("urutan_penomoran"."tanggal_terakhir", EXCLUDED."tanggal_terakhir"),
    "diperbarui_pada" = CURRENT_TIMESTAMP;

CREATE TABLE "buffer_nomor_surat_keluar" (
    "id" UUID NOT NULL,
    "tahun" INTEGER NOT NULL,
    "tanggal_surat" DATE NOT NULL,
    "nomor_urut" INTEGER NOT NULL,
    "dipakai_pada" TIMESTAMPTZ,
    "id_surat_keluar" UUID,
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buffer_nomor_surat_keluar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "buffer_nomor_surat_keluar_tahun_nomor_urut_key"
    ON "buffer_nomor_surat_keluar"("tahun", "nomor_urut");
CREATE INDEX "buffer_nomor_surat_keluar_tahun_tanggal_surat_dipakai_pada_idx"
    ON "buffer_nomor_surat_keluar"("tahun", "tanggal_surat", "dipakai_pada");

-- Petugas agenda kegiatan
CREATE TABLE "petugas_agenda" (
    "id" UUID NOT NULL,
    "id_surat" UUID NOT NULL,
    "id_pengguna" UUID NOT NULL,
    "keterangan" VARCHAR(300),
    "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petugas_agenda_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "petugas_agenda_id_surat_id_pengguna_key"
    ON "petugas_agenda"("id_surat", "id_pengguna");
CREATE INDEX "petugas_agenda_id_surat_idx" ON "petugas_agenda"("id_surat");

ALTER TABLE "petugas_agenda"
    ADD CONSTRAINT "petugas_agenda_id_surat_fkey"
    FOREIGN KEY ("id_surat") REFERENCES "surat_masuk"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "petugas_agenda"
    ADD CONSTRAINT "petugas_agenda_id_pengguna_fkey"
    FOREIGN KEY ("id_pengguna") REFERENCES "pengguna"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
