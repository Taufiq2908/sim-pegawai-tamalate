-- Arsip cuti: record arsip dapat merujuk ke permohonan cuti.
-- Alur SOP: staf mengarsipkan cuti -> record muncul di Buku Arsip dan
-- dashboard Sekcam -> Sekcam menyusun/menandatangani Daftar Arsip ->
-- staf melengkapi kode arsip setelah daftar ditandatangani.

ALTER TABLE "arsip"
  ADD COLUMN "id_permohonan_cuti" UUID;

CREATE UNIQUE INDEX "arsip_id_permohonan_cuti_key" ON "arsip"("id_permohonan_cuti");

ALTER TABLE "arsip"
  ADD CONSTRAINT "arsip_id_permohonan_cuti_fkey"
  FOREIGN KEY ("id_permohonan_cuti") REFERENCES "permohonan_cuti"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill cuti yang sudah berstatus ARCHIVED sebelum integrasi ini.
-- Nomor arsip memakai urutan tahunan yang sama dengan nextArchiveNumber().
WITH base AS (
  SELECT
    l."id",
    l."nomor_permohonan",
    l."tanggal_mulai",
    l."tanggal_selesai",
    l."total_hari",
    l."dibuat_oleh",
    l."status",
    COALESCE(l."diperbarui_pada", l."dibuat_pada") AS "archived_at",
    COALESCE(jc."nama", 'Cuti') AS "jenis_cuti",
    p."nama" AS "nama_pegawai",
    EXTRACT(YEAR FROM COALESCE(l."diperbarui_pada", l."dibuat_pada"))::int AS "tahun",
    CASE jc."kode"
      WHEN 'TAHUNAN' THEN '800.1.11.4'
      WHEN 'SAKIT' THEN '800.1.11.2'
      WHEN 'MELAHIRKAN' THEN '800.1.11.3'
      WHEN 'ALASAN_PENTING' THEN '800.1.11.5'
      ELSE NULL
    END AS "kode_klasifikasi"
  FROM "permohonan_cuti" l
  JOIN "pegawai" p ON p."id" = l."id_pegawai"
  LEFT JOIN "jenis_cuti" jc ON jc."id" = l."id_jenis_cuti"
),
leave_rows AS (
  SELECT
    b.*,
    ka."id" AS "id_klasifikasi",
    COALESCE(ka."kode", '000') AS "kode_arsip"
  FROM base b
  LEFT JOIN "klasifikasi_arsip" ka ON ka."kode" = b."kode_klasifikasi"
  WHERE b."status" = 'ARCHIVED'
    AND NOT EXISTS (
      SELECT 1 FROM "arsip" a WHERE a."id_permohonan_cuti" = b."id"
    )
),
max_seq AS (
  SELECT
    SUBSTRING("nomor_arsip" FROM 7 FOR 4)::int AS "tahun",
    MAX(
      CASE
        WHEN "nomor_arsip" ~ '^ARSIP-[0-9]{4}-[0-9]+$'
        THEN SUBSTRING("nomor_arsip" FROM 12)::int
        ELSE 0
      END
    ) AS "last_seq"
  FROM "arsip"
  WHERE "nomor_arsip" LIKE 'ARSIP-%'
  GROUP BY 1
),
numbered AS (
  SELECT
    lr.*,
    COALESCE(ms."last_seq", 0)
      + ROW_NUMBER() OVER (PARTITION BY lr."tahun" ORDER BY lr."archived_at", lr."id") AS "seq"
  FROM leave_rows lr
  LEFT JOIN max_seq ms ON ms."tahun" = lr."tahun"
)
INSERT INTO "arsip" (
  "id",
  "nomor_arsip",
  "jenis_sumber",
  "id_surat_masuk",
  "id_surat_keluar",
  "id_permohonan_cuti",
  "id_klasifikasi",
  "kode_arsip",
  "kode_berkas",
  "uraian",
  "nomor_dokumen",
  "tanggal_dokumen",
  "tanggal_arsip",
  "kategori",
  "lokasi_simpan",
  "lokasi_fisik",
  "retensi_sampai",
  "keterangan",
  "id_daftar_arsip",
  "dibuat_oleh",
  "dibuat_pada",
  "diperbarui_pada"
)
SELECT
  gen_random_uuid(),
  'ARSIP-' || n."tahun" || '-' || lpad(n."seq"::text, 4, '0'),
  'LEAVE',
  NULL,
  NULL,
  n."id",
  n."id_klasifikasi",
  n."kode_arsip",
  NULL,
  'Surat cuti ' || n."jenis_cuti" || ' - ' || n."nama_pegawai",
  n."nomor_permohonan",
  n."tanggal_mulai",
  n."archived_at"::date,
  'AKTIF',
  'LEMARI_ARSIP',
  NULL,
  NULL,
  'Cuti ' || n."tanggal_mulai" || ' s.d. ' || n."tanggal_selesai" || ' (' || n."total_hari" || ' hari)',
  NULL,
  n."dibuat_oleh",
  n."archived_at",
  n."archived_at"
FROM numbered n
ON CONFLICT DO NOTHING;
