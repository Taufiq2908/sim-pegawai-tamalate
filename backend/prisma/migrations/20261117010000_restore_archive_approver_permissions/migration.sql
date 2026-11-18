-- Pulihkan hak persetujuan arsip untuk Sekcam/Camat (role LEADER).
-- Seed terbaru sudah memuat archive.approve/archive.reject, tetapi database
-- yang belum menjalankan seed terbaru kehilangan grant ini sehingga antrean
-- arsip surat keluar tidak bisa dibuka oleh Sekcam/Camat.
-- Tidak ada perubahan skema.

-- Pastikan permission tersedia lebih dulu (idempoten).
INSERT INTO "izin" ("id", "kode", "sumber_daya", "aksi")
SELECT gen_random_uuid(), v."kode", 'archive', v."aksi"
FROM (
  VALUES
    ('archive.approve', 'approve'),
    ('archive.reject', 'reject')
) AS v("kode", "aksi")
WHERE NOT EXISTS (
  SELECT 1 FROM "izin" AS p WHERE p."kode" = v."kode"
);

-- LEADER = Sekcam/Camat (pembatasan jabatan tetap dilakukan di route).
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
JOIN "izin" AS p ON p."kode" IN ('archive.approve', 'archive.reject')
WHERE r."kode" = 'LEADER'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;
