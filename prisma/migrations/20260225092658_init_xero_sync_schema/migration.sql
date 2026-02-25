-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'APPROVER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'EXPENSE', 'REVENUE', 'DIRECTCOSTS', 'EQUITY', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INVOICE_REVERSAL', 'OVERPAYMENT_ALLOCATION', 'OVERPAYMENT_CREATION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "JobItemType" AS ENUM ('INVOICE', 'OVERPAYMENT');

-- CreateEnum
CREATE TYPE "JobItemStatus" AS ENUM ('PENDING', 'PROCESSED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('CONTACTS', 'INVOICES', 'OVERPAYMENTS', 'FULL');

-- CreateEnum
CREATE TYPE "SyncLogStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'JOB_CREATED', 'JOB_APPROVED', 'JOB_COMPLETED', 'XERO_CONNECTED', 'XERO_DISCONNECTED', 'USER_INVITED', 'ROLE_CHANGED', 'OTHER');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "xero_tenant_id" TEXT NOT NULL,
    "xero_short_code" TEXT,
    "base_currency" TEXT,
    "default_bank_account_id" TEXT,
    "default_cn_number_format" TEXT,
    "default_line_amount_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_company_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "granted_by_user_id" TEXT,
    "granted_at" TIMESTAMP(3),

    CONSTRAINT "user_company_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_connections" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "connected_by_user_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_refreshed_at" TIMESTAMP(3),

    CONSTRAINT "xero_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "xero_contact_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "default_currency" TEXT,
    "tax_number" TEXT,
    "is_supplier" BOOLEAN NOT NULL DEFAULT false,
    "is_customer" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "raw_xero_json" JSONB,

    CONSTRAINT "xero_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "xero_account_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency_code" TEXT,
    "tax_type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "xero_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "xero_invoice_id" TEXT NOT NULL,
    "xero_contact_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL,
    "currency_code" TEXT NOT NULL,
    "currency_rate" DECIMAL(18,4),
    "sub_total" DECIMAL(18,4) NOT NULL,
    "total_tax" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "amount_due" DECIMAL(18,4) NOT NULL,
    "amount_paid" DECIMAL(18,4),
    "line_amount_types" TEXT,
    "reference" TEXT,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "is_reconciled" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "raw_xero_json" JSONB,

    CONSTRAINT "xero_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_invoice_line_items" (
    "id" TEXT NOT NULL,
    "xero_invoice_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "line_item_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_amount" DECIMAL(18,4) NOT NULL,
    "tax_amount" DECIMAL(18,4),
    "line_amount" DECIMAL(18,4) NOT NULL,
    "account_code" TEXT,
    "tax_type" TEXT,
    "tracking_categories" JSONB,

    CONSTRAINT "xero_invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_overpayments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "xero_overpayment_id" TEXT NOT NULL,
    "xero_contact_id" TEXT NOT NULL,
    "overpayment_date" TIMESTAMP(3) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "currency_rate" DECIMAL(18,4),
    "remaining_credit" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "status" TEXT,
    "bank_account_xero_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "raw_xero_json" JSONB,

    CONSTRAINT "xero_overpayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_credit_notes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "xero_credit_note_id" TEXT NOT NULL,
    "xero_contact_id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "credit_note_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "currency_code" TEXT,
    "remaining_credit" DECIMAL(18,4),
    "total" DECIMAL(18,4),
    "last_synced_at" TIMESTAMP(3),
    "raw_xero_json" JSONB,

    CONSTRAINT "xero_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sync_type" "SyncType" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "status" "SyncLogStatus" NOT NULL,
    "records_fetched" INTEGER,
    "error_message" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "job_type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "reversal_date" TIMESTAMP(3),
    "total_items" INTEGER NOT NULL,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_items" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "item_type" "JobItemType" NOT NULL,
    "xero_invoice_id" TEXT,
    "xero_overpayment_id" TEXT,
    "invoice_number" TEXT,
    "contact_name" TEXT,
    "expected_amount" DECIMAL(18,4),
    "actual_amount_due" DECIMAL(18,4),
    "amount_mismatch_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "xero_credit_note_id" TEXT,
    "credit_note_number" TEXT,
    "xero_allocation_id" TEXT,
    "allocated_amount" DECIMAL(18,4),
    "status" "JobItemStatus" NOT NULL DEFAULT 'PENDING',
    "skip_reason" TEXT,
    "failure_reason" TEXT,
    "failure_raw_error" JSONB,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_item_retry_attempts" (
    "id" TEXT NOT NULL,
    "job_item_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT,
    "failure_reason" TEXT,
    "executed_at" TIMESTAMP(3),

    CONSTRAINT "job_item_retry_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_configurations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_type" "JobType" NOT NULL,
    "config_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "batch_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_xero_tenant_id_key" ON "Company"("xero_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_company_roles_user_id_company_id_key" ON "user_company_roles"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_company_id_key" ON "xero_connections"("company_id");

-- CreateIndex
CREATE INDEX "xero_contacts_company_id_name_idx" ON "xero_contacts"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "xero_contacts_company_id_xero_contact_id_key" ON "xero_contacts"("company_id", "xero_contact_id");

-- CreateIndex
CREATE INDEX "xero_accounts_company_id_idx" ON "xero_accounts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_accounts_company_id_xero_account_id_key" ON "xero_accounts"("company_id", "xero_account_id");

-- CreateIndex
CREATE INDEX "xero_invoices_company_id_status_invoice_date_idx" ON "xero_invoices"("company_id", "status", "invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "xero_invoices_company_id_xero_invoice_id_key" ON "xero_invoices"("company_id", "xero_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_invoice_line_items_xero_invoice_id_line_item_id_key" ON "xero_invoice_line_items"("xero_invoice_id", "line_item_id");

-- CreateIndex
CREATE INDEX "xero_overpayments_company_id_remaining_credit_idx" ON "xero_overpayments"("company_id", "remaining_credit");

-- CreateIndex
CREATE UNIQUE INDEX "xero_overpayments_company_id_xero_overpayment_id_key" ON "xero_overpayments"("company_id", "xero_overpayment_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_credit_notes_company_id_xero_credit_note_id_key" ON "xero_credit_notes"("company_id", "xero_credit_note_id");

-- CreateIndex
CREATE INDEX "sync_logs_company_id_sync_type_started_at_idx" ON "sync_logs"("company_id", "sync_type", "started_at");

-- CreateIndex
CREATE INDEX "jobs_company_id_status_created_at_idx" ON "jobs"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "job_items_job_id_status_idx" ON "job_items"("job_id", "status");

-- CreateIndex
CREATE INDEX "job_item_retry_attempts_job_item_id_idx" ON "job_item_retry_attempts"("job_item_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_contacts" ADD CONSTRAINT "xero_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_accounts" ADD CONSTRAINT "xero_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_invoices" ADD CONSTRAINT "xero_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_invoices" ADD CONSTRAINT "xero_invoices_xero_contact_id_fkey" FOREIGN KEY ("xero_contact_id") REFERENCES "xero_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_invoice_line_items" ADD CONSTRAINT "xero_invoice_line_items_xero_invoice_id_fkey" FOREIGN KEY ("xero_invoice_id") REFERENCES "xero_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_overpayments" ADD CONSTRAINT "xero_overpayments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_overpayments" ADD CONSTRAINT "xero_overpayments_xero_contact_id_fkey" FOREIGN KEY ("xero_contact_id") REFERENCES "xero_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_credit_notes" ADD CONSTRAINT "xero_credit_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_credit_notes" ADD CONSTRAINT "xero_credit_notes_xero_contact_id_fkey" FOREIGN KEY ("xero_contact_id") REFERENCES "xero_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_xero_invoice_id_fkey" FOREIGN KEY ("xero_invoice_id") REFERENCES "xero_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_xero_overpayment_id_fkey" FOREIGN KEY ("xero_overpayment_id") REFERENCES "xero_overpayments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_item_retry_attempts" ADD CONSTRAINT "job_item_retry_attempts_job_item_id_fkey" FOREIGN KEY ("job_item_id") REFERENCES "job_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_configurations" ADD CONSTRAINT "batch_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_configurations" ADD CONSTRAINT "batch_configurations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
