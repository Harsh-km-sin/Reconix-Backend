/*
  Warnings:

  - You are about to drop the column `entity_id` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `entity_type` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `company_id` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `connected_by_user_id` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `last_refreshed_at` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `token_expires_at` on the `xero_connections` table. All the data in the column will be lost.
  - The `scopes` column on the `xero_connections` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[idempotency_key]` on the table `job_items` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenant_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.
  - Made the column `company_id` on table `audit_logs` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `action` on the `audit_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `expires_at` to the `xero_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `xero_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_name` to the `xero_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_type` to the `xero_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `xero_connections` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_company_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_connections" DROP CONSTRAINT "xero_connections_company_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_connections" DROP CONSTRAINT "xero_connections_connected_by_user_id_fkey";

-- DropIndex
DROP INDEX "audit_logs_user_id_created_at_idx";

-- DropIndex
DROP INDEX "xero_connections_company_id_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_secret" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "entity_id",
DROP COLUMN "entity_type",
ADD COLUMN     "resource_id" TEXT,
ADD COLUMN     "resource_type" TEXT,
ADD COLUMN     "user_agent" TEXT,
ADD COLUMN     "xero_request" JSONB,
ADD COLUMN     "xero_response" JSONB,
ALTER COLUMN "company_id" SET NOT NULL,
DROP COLUMN "action",
ADD COLUMN     "action" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "job_items" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "xero_request_payload" JSONB,
ADD COLUMN     "xero_response_payload" JSONB;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_user_id" TEXT,
ADD COLUMN     "excel_upload_id" TEXT,
ADD COLUMN     "field_mapping_id" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by_id" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "validation_report" JSONB;

-- AlterTable
ALTER TABLE "xero_connections" DROP COLUMN "company_id",
DROP COLUMN "connected_by_user_id",
DROP COLUMN "last_refreshed_at",
DROP COLUMN "token_expires_at",
ADD COLUMN     "expires_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "tenant_id" TEXT NOT NULL,
ADD COLUMN     "tenant_name" TEXT NOT NULL,
ADD COLUMN     "tenant_type" TEXT NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
DROP COLUMN "scopes",
ADD COLUMN     "scopes" TEXT[];

-- DropEnum
DROP TYPE "AuditAction";

-- CreateTable
CREATE TABLE "xero_bank_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "xero_account_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "bank_account_number" TEXT,
    "bank_account_type" TEXT,
    "currency_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "xero_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_log" (
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_log_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "field_mapping_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_mapping_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excel_uploads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sheets_found" TEXT[],
    "status" TEXT NOT NULL,
    "parsed_data" JSONB,
    "job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excel_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xero_bank_accounts_company_id_idx" ON "xero_bank_accounts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_bank_accounts_company_id_xero_account_id_key" ON "xero_bank_accounts"("company_id", "xero_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_mapping_templates_company_id_name_key" ON "field_mapping_templates"("company_id", "name");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_action_idx" ON "audit_logs"("company_id", "action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_id_idx" ON "audit_logs"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_items_idempotency_key_key" ON "job_items"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_tenant_id_key" ON "xero_connections"("tenant_id");

-- CreateIndex
CREATE INDEX "xero_connections_user_id_idx" ON "xero_connections"("user_id");

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connection_company_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Company"("xero_tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_bank_accounts" ADD CONSTRAINT "xero_bank_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_mapping_templates" ADD CONSTRAINT "field_mapping_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_mapping_templates" ADD CONSTRAINT "field_mapping_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_uploads" ADD CONSTRAINT "excel_uploads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_uploads" ADD CONSTRAINT "excel_uploads_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
