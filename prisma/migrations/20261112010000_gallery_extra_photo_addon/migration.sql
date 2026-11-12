ALTER TABLE "PortfolioGallery" ADD COLUMN "extraPhotoAddOnId" TEXT;
ALTER TABLE "ServiceLibraryItem" ADD COLUMN "commerceProductId" TEXT;
CREATE UNIQUE INDEX "ServiceLibraryItem_commerceProductId_key" ON "ServiceLibraryItem"("commerceProductId");
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_extraPhotoAddOnId_fkey" FOREIGN KEY ("extraPhotoAddOnId") REFERENCES "ServiceLibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceLibraryItem" ADD CONSTRAINT "ServiceLibraryItem_commerceProductId_fkey" FOREIGN KEY ("commerceProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortfolioSelectionPurchase" ALTER COLUMN "packageProductId" DROP NOT NULL;
ALTER TABLE "PortfolioSelectionPurchase" ADD COLUMN "extraPhotoAddOnId" TEXT;
