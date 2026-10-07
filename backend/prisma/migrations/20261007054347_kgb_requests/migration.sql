-- CreateTable
CREATE TABLE "kgb_requests" (
    "id" UUID NOT NULL,
    "request_number" VARCHAR(40) NOT NULL,
    "employee_id" UUID NOT NULL,
    "old_rank" VARCHAR(20) NOT NULL,
    "new_rank" VARCHAR(20) NOT NULL,
    "old_salary" INTEGER NOT NULL,
    "new_salary" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ,
    "current_holder_role" VARCHAR(20),
    "rejection_reason" TEXT,
    "revision_note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kgb_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kgb_documents" (
    "id" UUID NOT NULL,
    "kgb_request_id" UUID NOT NULL,
    "doc_type" VARCHAR(50) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kgb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kgb_approvals" (
    "id" UUID NOT NULL,
    "kgb_request_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_role" VARCHAR(20) NOT NULL,
    "actor_position" VARCHAR(50),
    "from_status" VARCHAR(20) NOT NULL,
    "to_status" VARCHAR(20) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kgb_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kgb_requests_request_number_key" ON "kgb_requests"("request_number");

-- CreateIndex
CREATE INDEX "kgb_requests_employee_id_status_idx" ON "kgb_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "kgb_approvals_kgb_request_id_idx" ON "kgb_approvals"("kgb_request_id");

-- AddForeignKey
ALTER TABLE "kgb_requests" ADD CONSTRAINT "kgb_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kgb_requests" ADD CONSTRAINT "kgb_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kgb_documents" ADD CONSTRAINT "kgb_documents_kgb_request_id_fkey" FOREIGN KEY ("kgb_request_id") REFERENCES "kgb_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kgb_documents" ADD CONSTRAINT "kgb_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kgb_approvals" ADD CONSTRAINT "kgb_approvals_kgb_request_id_fkey" FOREIGN KEY ("kgb_request_id") REFERENCES "kgb_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kgb_approvals" ADD CONSTRAINT "kgb_approvals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
