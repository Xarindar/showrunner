ALTER TABLE "Client" ADD COLUMN "mediaFolderId" TEXT;
ALTER TABLE "PortfolioGallery" ADD COLUMN "mediaFolderId" TEXT;
CREATE UNIQUE INDEX "Client_mediaFolderId_key" ON "Client"("mediaFolderId");
CREATE UNIQUE INDEX "PortfolioGallery_mediaFolderId_key" ON "PortfolioGallery"("mediaFolderId");
ALTER TABLE "Client" ADD CONSTRAINT "Client_mediaFolderId_fkey" FOREIGN KEY ("mediaFolderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_mediaFolderId_fkey" FOREIGN KEY ("mediaFolderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioGallery" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
