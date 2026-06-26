ALTER TABLE "ClientFile" ADD COLUMN "mediaAssetId" TEXT;

CREATE INDEX "ClientFile_mediaAssetId_idx" ON "ClientFile"("mediaAssetId");

ALTER TABLE "ClientFile"
  ADD CONSTRAINT "ClientFile_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
