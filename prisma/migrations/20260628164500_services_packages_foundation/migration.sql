-- Rebrand scheduling admin around services and add package composition.
ALTER TABLE "Service"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "Service_siteId_category_idx" ON "Service"("siteId", "category");
CREATE INDEX "Service_siteId_isActive_idx" ON "Service"("siteId", "isActive");

CREATE TABLE "ServicePackage" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServicePackageItem" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServicePackageItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServicePackage_siteId_slug_key" ON "ServicePackage"("siteId", "slug");
CREATE INDEX "ServicePackage_siteId_isActive_idx" ON "ServicePackage"("siteId", "isActive");
CREATE INDEX "ServicePackage_siteId_sortOrder_idx" ON "ServicePackage"("siteId", "sortOrder");

CREATE UNIQUE INDEX "ServicePackageItem_packageId_serviceId_key" ON "ServicePackageItem"("packageId", "serviceId");
CREATE INDEX "ServicePackageItem_siteId_serviceId_idx" ON "ServicePackageItem"("siteId", "serviceId");
CREATE INDEX "ServicePackageItem_siteId_packageId_idx" ON "ServicePackageItem"("siteId", "packageId");

ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
