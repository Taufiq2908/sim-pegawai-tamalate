-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "check_out_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "warning_letters" (
    "id" UUID NOT NULL,
    "letter_number" VARCHAR(40) NOT NULL,
    "employee_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "absence_count" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warning_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warning_letters_letter_number_key" ON "warning_letters"("letter_number");

-- CreateIndex
CREATE UNIQUE INDEX "warning_letters_employee_id_week_start_key" ON "warning_letters"("employee_id", "week_start");

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
