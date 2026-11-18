-- Pulihkan akses fitur Kenaikan Pangkat yang hilang dari role non-SUPER_ADMIN.
-- Seed terbaru (ROLE_MAP) sudah memuat grant ini; migrasi ini menyelaraskan
-- database yang belum menjalankan seed terbaru atau yang grant-nya terhapus.
-- Tidak ada perubahan skema.

-- VERIFIER: operator pengajuan/legalisasi/register/arsip usulan.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
JOIN "izin" AS p ON p."kode" IN (
  'promotion.view',
  'promotion.create',
  'promotion.legalize',
  'promotion.register',
  'promotion.archive',
  'promotion.document.upload'
)
WHERE r."kode" = 'VERIFIER'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;

-- SUPERVISOR: melihat usulan; wewenang Kasubag tetap lewat GRANT per user.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
JOIN "izin" AS p ON p."kode" = 'promotion.view'
WHERE r."kode" = 'SUPERVISOR'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;

-- LEADER (Sekcam/Camat): melihat, paraf, keputusan, revisi, tolak.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
JOIN "izin" AS p ON p."kode" IN (
  'promotion.view',
  'promotion.paraf',
  'promotion.approve',
  'promotion.revise',
  'promotion.reject'
)
WHERE r."kode" = 'LEADER'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;

-- EMPLOYEE: melihat usulan yang memuat dirinya.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
JOIN "izin" AS p ON p."kode" = 'promotion.view'
WHERE r."kode" = 'EMPLOYEE'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;
