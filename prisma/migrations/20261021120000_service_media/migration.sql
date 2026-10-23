ALTER TABLE "Service" ADD COLUMN "rectangularMediaAssetId" TEXT,
ADD COLUMN "rectangularImageFraming" JSONB;

CREATE INDEX "Service_rectangularMediaAssetId_idx" ON "Service"("rectangularMediaAssetId");
ALTER TABLE "Service" ADD CONSTRAINT "Service_rectangularMediaAssetId_fkey"
FOREIGN KEY ("rectangularMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "_ServiceGalleryAssets" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_ServiceGalleryAssets_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_ServiceGalleryAssets_B_index" ON "_ServiceGalleryAssets"("B");
ALTER TABLE "_ServiceGalleryAssets" ADD CONSTRAINT "_ServiceGalleryAssets_A_fkey"
FOREIGN KEY ("A") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ServiceGalleryAssets" ADD CONSTRAINT "_ServiceGalleryAssets_B_fkey"
FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
