-- Pulihkan akses Kenaikan Pangkat dan persetujuan arsip yang hilang dari
-- role non-SUPER_ADMIN. Migrasi sebelumnya sudah pernah menambahkan grant ini,
-- tetapi state database saat ini kehilangan link role-permission (mis. setelah
-- reset/seed sebagian). Migrasi ini idempoten dan tidak mengubah skema.

-- Pastikan permission yang dituju tersedia lebih dulu.
INSERT INTO "izin" ("id", "kode", "sumber_daya", "aksi")
SELECT gen_random_uuid(), v."kode", v."sumber_daya", v."aksi"
FROM (
  VALUES
    ('promotion.view', 'promotion', 'view'),
    ('promotion.create', 'promotion', 'create'),
    ('promotion.legalize', 'promotion', 'legalize'),
    ('promotion.verify', 'promotion', 'verify'),
    ('promotion.revise', 'promotion', 'revise'),
    ('promotion.paraf', 'promotion', 'paraf'),
    ('promotion.approve', 'promotion', 'approve'),
    ('promotion.reject', 'promotion', 'reject'),
    ('promotion.register', 'promotion', 'register'),
    ('promotion.archive', 'promotion', 'archive'),
    ('promotion.document.upload', 'promotion', 'document.upload'),
    ('archive.approve', 'archive', 'approve'),
    ('archive.reject', 'archive', 'reject')
) AS v("kode", "sumber_daya", "aksi")
WHERE NOT EXISTS (
  SELECT 1 FROM "izin" AS p WHERE p."kode" = v."kode"
);

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

-- LEADER (Sekcam/Camat): melihat, paraf, keputusan, revisi, tolak,
-- serta persetujuan antrean arsip surat keluar.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
JOIN "izin" AS p ON p."kode" IN (
  'promotion.view',
  'promotion.paraf',
  'promotion.approve',
  'promotion.revise',
  'promotion.reject',
  'archive.approve',
  'archive.reject'
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
