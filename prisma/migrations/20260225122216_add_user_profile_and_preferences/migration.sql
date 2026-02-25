-- AlterTable
ALTER TABLE "User" ADD COLUMN     "date_format" TEXT,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "preferences" JSONB,
ADD COLUMN     "timezone" TEXT;
