-- AlterTable
ALTER TABLE "incoming_letters" ADD COLUMN     "distributed_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "warning_letters" ADD COLUMN     "coached_at" TIMESTAMPTZ,
ADD COLUMN     "coaching_follow_up" VARCHAR(20) NOT NULL DEFAULT 'NONE',
ADD COLUMN     "coaching_result" TEXT,
ADD COLUMN     "summon_note" TEXT,
ADD COLUMN     "summon_scheduled_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "attendance_session_photos" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "session" VARCHAR(10) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_session_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_session_photos_date_session_key" ON "attendance_session_photos"("date", "session");

-- AddForeignKey
ALTER TABLE "attendance_session_photos" ADD CONSTRAINT "attendance_session_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
