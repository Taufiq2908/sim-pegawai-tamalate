-- Staf Kepegawaian/Arsip boleh menyelesaikan arsip surat masuk.
INSERT INTO "peran_izin" ("id_peran", "id_izin")
SELECT r."id", p."id"
FROM "peran" r
JOIN "izin" p ON p."kode" = 'letter.archive'
WHERE r."kode"::text = 'VERIFIER'
ON CONFLICT ("id_peran", "id_izin") DO NOTHING;
