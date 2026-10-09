-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "corrected_at" TIMESTAMPTZ,
ADD COLUMN     "corrected_by" UUID;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
