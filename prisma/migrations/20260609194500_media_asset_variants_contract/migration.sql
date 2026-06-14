-- Expand media from a single stored URL into an adapter-backed asset plus variant contract.

ALTER TYPE "MediaDriver" ADD VALUE IF NOT EXISTS 'CLOUDFLARE_IMAGES';

CREATE TYPE "MediaVariantType" AS ENUM ('THUMBNAIL', 'CARD', 'HERO', 'FULL', 'SOCIAL', 'DOWNLOAD');

ALTER TABLE "MediaAsset"
  ADD COLUMN "storageProviderId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "usageContext" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "focalPointX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "focalPointY" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

CREATE TABLE "MediaAssetVariant" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" "MediaVariantType" NOT NULL,
  "url" TEXT NOT NULL DEFAULT '',
  "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0,
  "format" TEXT NOT NULL DEFAULT '',
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaAssetVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAssetVariant_assetId_type_key" ON "MediaAssetVariant"("assetId", "type");
CREATE INDEX "MediaAssetVariant_type_idx" ON "MediaAssetVariant"("type");

ALTER TABLE "MediaAssetVariant"
  ADD CONSTRAINT "MediaAssetVariant_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
