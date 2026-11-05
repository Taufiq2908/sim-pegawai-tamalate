-- Policy cuti: leave.create hanya untuk cuti sendiri dan dicabut dari VERIFIER.
-- Tidak ada perubahan skema. Migrasi ini hanya menyelaraskan data izin yang
-- mungkin masih memuat grant lama dari seed/konfigurasi sebelumnya.

-- 1) Cabut leave.create dari role VERIFIER.
DELETE FROM "peran_izin" AS rp
USING "peran" AS r, "izin" AS p
WHERE rp."id_peran" = r."id"
  AND rp."id_izin" = p."id"
  AND r."kode" = 'VERIFIER'
  AND p."kode" = 'leave.create';

-- 2) Cabut GRANT individual leave.create untuk seluruh user ber-role VERIFIER.
DELETE FROM "pengguna_izin_override" AS upo
USING "pengguna" AS u, "izin" AS p
WHERE upo."id_pengguna" = u."id"
  AND upo."id_izin" = p."id"
  AND u."peran" = 'VERIFIER'
  AND p."kode" = 'leave.create'
  AND upo."efek" = 'GRANT';

-- 3) Pastikan EMPLOYEE dan LEADER tetap memegang leave.create.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" AS r
CROSS JOIN "izin" AS p
WHERE r."kode" IN ('EMPLOYEE', 'LEADER')
  AND p."kode" = 'leave.create'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;
