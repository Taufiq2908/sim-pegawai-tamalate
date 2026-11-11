-- Audit/normalisasi seluruh status surat masuk lama yang berada di luar
-- workflow saat ini. Idempoten: baris yang sudah memakai status baru tidak berubah.
--
-- Pemetaan mengikuti migrasi 20261105010000_surat_workflow_revision:
--   RECEIVED  -> REVIEW_SEKCAM
--   PARAF     -> DISPOSISI_CAMAT
--   DISPOSED  -> DITERUSKAN
--   COMPLETED -> MENUNGGU_ARSIP
--   ARCHIVED  -> DIARSIPKAN
--
-- AGENDA-2026-0042 dipilih menjadi REVIEW_SEKCAM karena dibuat oleh verifier
-- dan status RECEIVED lama berarti surat sudah diterima/diajukan ke Sekcam,
-- bukan masih draft TU.

UPDATE "surat_masuk"
SET "status" = 'REVIEW_SEKCAM',
    "diajukan_pada" = COALESCE("diajukan_pada", "dibuat_pada", NOW())
WHERE "status" = 'RECEIVED';

UPDATE "surat_masuk"
SET "status" = 'DISPOSISI_CAMAT',
    "diajukan_pada" = COALESCE("diajukan_pada", "dibuat_pada", NOW())
WHERE "status" = 'PARAF';

UPDATE "surat_masuk"
SET "status" = 'DITERUSKAN',
    "diajukan_pada" = COALESCE("diajukan_pada", "dibuat_pada", NOW())
WHERE "status" = 'DISPOSED';

UPDATE "surat_masuk"
SET "status" = 'MENUNGGU_ARSIP',
    "diajukan_pada" = COALESCE("diajukan_pada", "dibuat_pada", NOW())
WHERE "status" = 'COMPLETED';

UPDATE "surat_masuk"
SET "status" = 'DIARSIPKAN',
    "diajukan_pada" = COALESCE("diajukan_pada", "dibuat_pada", NOW()),
    "diarsipkan_pada" = COALESCE("diarsipkan_pada", NOW())
WHERE "status" = 'ARCHIVED';
