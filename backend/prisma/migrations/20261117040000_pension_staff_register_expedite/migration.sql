-- SOP pensiun langkah 6-8 (agenda surat keluar, ekspedisi, bukti terima)
-- adalah tugas Staf Kepegawaian (VERIFIER), bukan Kasubag.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" r
JOIN "izin" p ON p."kode" IN ('pension.register', 'pension.expedite')
WHERE r."kode" = 'VERIFIER'
ON CONFLICT DO NOTHING;

-- Bersihkan grant lama Kasubag untuk dua permission yang kini menjadi
-- porsi pelaksana. Grant lain (verify/revise/reject) tetap dipertahankan.
DELETE FROM "pengguna_izin_override" o
USING "pengguna" u, "izin" p
WHERE o."id_pengguna" = u."id"
  AND o."id_izin" = p."id"
  AND o."efek" = 'GRANT'
  AND p."kode" IN ('pension.register', 'pension.expedite')
  AND u."jabatan" = 'KASUBAG';
