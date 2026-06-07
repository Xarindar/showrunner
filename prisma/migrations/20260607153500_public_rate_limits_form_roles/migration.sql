-- CreateEnum
CREATE TYPE "FormFieldRole" AS ENUM ('NONE', 'SUBMITTER_NAME', 'SUBMITTER_EMAIL');

-- AlterTable
ALTER TABLE "FormField" ADD COLUMN "fieldRole" "FormFieldRole" NOT NULL DEFAULT 'NONE';

-- Backfill starter/common form identity fields so submitter metadata is not label-guessed.
UPDATE "FormField"
SET "fieldRole" = 'SUBMITTER_EMAIL'
WHERE "type" = 'EMAIL';

UPDATE "FormField"
SET "fieldRole" = 'SUBMITTER_NAME'
WHERE "type" IN ('TEXT', 'SIGNATURE')
  AND lower("label") IN ('name', 'your name', 'full name', 'customer name', 'client name');

-- CreateTable
CREATE TABLE "PublicRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormField_fieldRole_idx" ON "FormField"("fieldRole");

-- CreateIndex
CREATE UNIQUE INDEX "PublicRateLimit_key_key" ON "PublicRateLimit"("key");

-- CreateIndex
CREATE INDEX "PublicRateLimit_scope_identifier_idx" ON "PublicRateLimit"("scope", "identifier");

-- CreateIndex
CREATE INDEX "PublicRateLimit_windowStart_idx" ON "PublicRateLimit"("windowStart");
