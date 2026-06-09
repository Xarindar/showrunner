-- AlterEnum
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'GALLERY_VIEWED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'FAVORITE_ADDED';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaAsset" ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaAsset" ADD COLUMN "folder" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaAsset" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "MediaAsset" ADD COLUMN "caption" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaAsset" ADD COLUMN "credit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaAsset" ADD COLUMN "isDecorative" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaAsset" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaAsset" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "MediaAsset" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "MediaAsset_folder_idx" ON "MediaAsset"("folder");
CREATE INDEX "MediaAsset_isPrivate_idx" ON "MediaAsset"("isPrivate");
CREATE INDEX "MediaAsset_deletedAt_idx" ON "MediaAsset"("deletedAt");
