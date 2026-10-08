-- Kunci harian apel + eskalasi pembinaan (forward Sekcam, instruksi Camat)
CREATE TABLE "attendance_locks" (
  "date" DATE NOT NULL,
  "locked_by" UUID NOT NULL,
  "note" TEXT,
  "locked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_locks_pkey" PRIMARY KEY ("date")
);

ALTER TABLE "warning_letters"
  ADD COLUMN "forward_by" UUID,
  ADD COLUMN "forward_at" TIMESTAMPTZ,
  ADD COLUMN "forward_note" TEXT,
  ADD COLUMN "instructed_by" UUID,
  ADD COLUMN "instructed_at" TIMESTAMPTZ,
  ADD COLUMN "instruction" TEXT;
