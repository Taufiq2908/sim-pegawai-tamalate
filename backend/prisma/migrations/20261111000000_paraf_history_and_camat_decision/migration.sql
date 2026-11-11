-- Revisi cuti/KGB: versi dokumen, riwayat paraf append-only, keputusan Camat,
-- dan penugasan Plt agar notifikasi/wewenang sampai ke pemegang jabatan aktif.

ALTER TABLE "permohonan_cuti"
  ADD COLUMN "versi" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "permohonan_kgb"
  ADD COLUMN "versi" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "disetujui_pada" TIMESTAMPTZ,
  ADD COLUMN "disetujui_oleh" UUID,
  ADD COLUMN "catatan_persetujuan" TEXT;

ALTER TABLE "persetujuan_kgb"
  ADD COLUMN "nama_aktor" VARCHAR(150),
  ADD COLUMN "nip_aktor" VARCHAR(30);

-- Hash konten file disimpan saat upload agar hash dokumen membuktikan isi
-- berkas, bukan hanya metadata. Baris lama boleh NULL sampai diunggah ulang.
ALTER TABLE "dokumen_cuti"
  ADD COLUMN "hash_konten" VARCHAR(64);

ALTER TABLE "dokumen_kgb"
  ADD COLUMN "hash_konten" VARCHAR(64);

-- Backfill penanda persetujuan untuk KGB lama yang sudah APPROVED/REGISTERED.
UPDATE "permohonan_kgb" AS k
SET
  "disetujui_pada" = a."dibuat_pada",
  "disetujui_oleh" = a."id_aktor",
  "catatan_persetujuan" = a."catatan"
FROM (
  SELECT DISTINCT ON ("id_permohonan_kgb")
    "id_permohonan_kgb",
    "id_aktor",
    "catatan",
    "dibuat_pada"
  FROM "persetujuan_kgb"
  WHERE "aksi" = 'APPROVE' OR "ke_status" = 'APPROVED'
  ORDER BY "id_permohonan_kgb", "dibuat_pada" ASC
) AS a
WHERE k."id" = a."id_permohonan_kgb"
  AND k."status" IN ('APPROVED', 'REGISTERED', 'SUBMITTED_BKPSDMD', 'COMPLETED', 'ARCHIVED');

CREATE TABLE "penugasan_plt" (
  "id" UUID NOT NULL,
  "jabatan" VARCHAR(50) NOT NULL,
  "id_pengguna" UUID NOT NULL,
  "mulai_pada" TIMESTAMPTZ NOT NULL,
  "berakhir_pada" TIMESTAMPTZ,
  "aktif" BOOLEAN NOT NULL DEFAULT true,
  "alasan" VARCHAR(255),
  "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "penugasan_plt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "riwayat_paraf" (
  "id" UUID NOT NULL,
  "jenis_dokumen" VARCHAR(30) NOT NULL,
  "id_dokumen" UUID NOT NULL,
  "nomor_dokumen" VARCHAR(80),
  "versi_dokumen" INTEGER NOT NULL,
  "hash_dokumen" VARCHAR(64) NOT NULL,
  "id_aktor" UUID NOT NULL,
  "nama_aktor" VARCHAR(150) NOT NULL,
  "nip_aktor" VARCHAR(30),
  "jabatan_aktor" VARCHAR(50),
  "aksi" VARCHAR(20) NOT NULL,
  "catatan" TEXT,
  "dibuat_pada" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "riwayat_paraf_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "penugasan_plt_jabatan_aktif_mulai_pada_berakhir_pada_idx"
  ON "penugasan_plt"("jabatan", "aktif", "mulai_pada", "berakhir_pada");

CREATE INDEX "penugasan_plt_id_pengguna_aktif_idx"
  ON "penugasan_plt"("id_pengguna", "aktif");

CREATE INDEX "riwayat_paraf_jenis_dokumen_id_dokumen_dibuat_pada_idx"
  ON "riwayat_paraf"("jenis_dokumen", "id_dokumen", "dibuat_pada");

CREATE INDEX "riwayat_paraf_id_aktor_idx"
  ON "riwayat_paraf"("id_aktor");

ALTER TABLE "penugasan_plt"
  ADD CONSTRAINT "penugasan_plt_id_pengguna_fkey"
  FOREIGN KEY ("id_pengguna") REFERENCES "pengguna"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "riwayat_paraf"
  ADD CONSTRAINT "riwayat_paraf_id_aktor_fkey"
  FOREIGN KEY ("id_aktor") REFERENCES "pengguna"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only: riwayat paraf tidak boleh diubah atau dihapus, termasuk lewat SQL.
CREATE OR REPLACE FUNCTION "cegah_perubahan_riwayat_paraf"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'riwayat_paraf bersifat append-only: % tidak diizinkan', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "riwayat_paraf_append_only"
BEFORE UPDATE OR DELETE ON "riwayat_paraf"
FOR EACH ROW EXECUTE FUNCTION "cegah_perubahan_riwayat_paraf"();

CREATE TRIGGER "riwayat_paraf_no_truncate"
BEFORE TRUNCATE ON "riwayat_paraf"
FOR EACH STATEMENT EXECUTE FUNCTION "cegah_perubahan_riwayat_paraf"();
