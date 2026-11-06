-- Normalisasi status lama surat masuk ke workflow baru.
-- Status RECEIVED berasal dari alur lama dan tidak dikenali oleh filter Sekcam,
-- sehingga surat tidak muncul di halaman Sekcam maupun notifikasi terkait.
UPDATE "surat_masuk"
SET "status" = 'REVIEW_SEKCAM',
    "diajukan_pada" = COALESCE("diajukan_pada", "dibuat_pada", NOW())
WHERE "status" = 'RECEIVED';
