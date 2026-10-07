-- AlterTable
ALTER TABLE "incoming_letters" ADD COLUMN     "addressed_to" VARCHAR(200),
ADD COLUMN     "classification_id" UUID,
ADD COLUMN     "pic" VARCHAR(150),
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "resolution_date" DATE,
ADD COLUMN     "secrecy" VARCHAR(5) NOT NULL DEFAULT 'B',
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "letter_dispositions" ADD COLUMN     "target_code" VARCHAR(30),
ADD COLUMN     "target_name" VARCHAR(150);

-- CreateTable
CREATE TABLE "archive_classifications" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposition_targets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "disposition_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_letters" (
    "id" UUID NOT NULL,
    "letter_number" VARCHAR(150) NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "classification_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient" VARCHAR(200),
    "letter_date" DATE NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'BIASA',
    "secrecy" VARCHAR(5) NOT NULL DEFAULT 'B',
    "signer_name" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
    "reservation_reason" TEXT,
    "cancel_reason" TEXT,
    "reserved_by" UUID,
    "reserved_at" TIMESTAMPTZ,
    "issued_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "outgoing_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_documents" (
    "id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outgoing_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numbering_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "numbering_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "expedition_receipts" (
    "id" UUID NOT NULL,
    "reg_number" VARCHAR(40) NOT NULL,
    "letter_id" UUID NOT NULL,
    "receipt_date" DATE NOT NULL,
    "receiver_name" VARCHAR(150) NOT NULL,
    "signature_name" VARCHAR(150),
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expedition_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "archive_classifications_code_key" ON "archive_classifications"("code");

-- CreateIndex
CREATE UNIQUE INDEX "disposition_targets_code_key" ON "disposition_targets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "outgoing_letters_letter_number_key" ON "outgoing_letters"("letter_number");

-- CreateIndex
CREATE INDEX "outgoing_letters_status_idx" ON "outgoing_letters"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outgoing_letters_year_sequence_number_key" ON "outgoing_letters"("year", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "expedition_receipts_reg_number_key" ON "expedition_receipts"("reg_number");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "incoming_letters" ADD CONSTRAINT "incoming_letters_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "archive_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "archive_classifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_reserved_by_fkey" FOREIGN KEY ("reserved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_letters" ADD CONSTRAINT "outgoing_letters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_documents" ADD CONSTRAINT "outgoing_documents_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "outgoing_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_documents" ADD CONSTRAINT "outgoing_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expedition_receipts" ADD CONSTRAINT "expedition_receipts_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "incoming_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expedition_receipts" ADD CONSTRAINT "expedition_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
