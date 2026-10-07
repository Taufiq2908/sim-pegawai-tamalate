-- CreateTable
CREATE TABLE "incoming_letters" (
    "id" UUID NOT NULL,
    "agenda_number" VARCHAR(40) NOT NULL,
    "letter_number" VARCHAR(100) NOT NULL,
    "sender" VARCHAR(200) NOT NULL,
    "subject" TEXT NOT NULL,
    "letter_date" DATE NOT NULL,
    "received_date" DATE NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'BIASA',
    "status" VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    "completion_note" TEXT,
    "completed_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "incoming_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_dispositions" (
    "id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "instruction" TEXT NOT NULL,
    "deadline" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "response_note" TEXT,
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_documents" (
    "id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incoming_letters_agenda_number_key" ON "incoming_letters"("agenda_number");

-- CreateIndex
CREATE INDEX "incoming_letters_status_idx" ON "incoming_letters"("status");

-- CreateIndex
CREATE INDEX "letter_dispositions_letter_id_idx" ON "letter_dispositions"("letter_id");

-- AddForeignKey
ALTER TABLE "incoming_letters" ADD CONSTRAINT "incoming_letters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "incoming_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_dispositions" ADD CONSTRAINT "letter_dispositions_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_documents" ADD CONSTRAINT "letter_documents_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "incoming_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_documents" ADD CONSTRAINT "letter_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
