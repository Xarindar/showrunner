-- §14b chunk-4: configurable, modular data-access scope.
-- Adds owner-configurable scope storage and the staff-field ownership columns
-- needed to fix PHOTOGRAPHER ownership and extend scoping to portfolio/media.

ALTER TABLE "SiteSettings" ADD COLUMN "dataScopeConfig" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "PortfolioGallery" ADD COLUMN "photographerId" TEXT;
CREATE INDEX "PortfolioGallery_photographerId_idx" ON "PortfolioGallery"("photographerId");
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MediaAsset" ADD COLUMN "uploadedByStaffId" TEXT;
CREATE INDEX "MediaAsset_uploadedByStaffId_idx" ON "MediaAsset"("uploadedByStaffId");
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedByStaffId_fkey" FOREIGN KEY ("uploadedByStaffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
