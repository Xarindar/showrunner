CREATE TABLE "EmailHeaderLogo" (
  "siteId" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  CONSTRAINT "EmailHeaderLogo_pkey" PRIMARY KEY ("siteId", "profile"),
  CONSTRAINT "EmailHeaderLogo_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmailHeaderLogo_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmailHeaderLogo_mediaAssetId_idx" ON "EmailHeaderLogo"("mediaAssetId");
