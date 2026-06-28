-- Extend the catalog core without breaking existing product/cart/order records.
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'BUNDLE';

CREATE TYPE "ProductMediaRole" AS ENUM ('PRIMARY', 'GALLERY');

ALTER TABLE "Product"
  ADD COLUMN "seoTitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "seoDescription" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "vendor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requiresShipping" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weightGrams" INTEGER,
  ADD COLUMN "externalReference" TEXT NOT NULL DEFAULT '';

UPDATE "Product"
SET "requiresShipping" = true
WHERE "type" = 'PHYSICAL';

ALTER TABLE "ProductVariant"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "ProductOption" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductOptionValue" (
  "id" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariantOptionValue" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "optionValueId" TEXT NOT NULL,
  CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductMedia" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "mediaAssetId" TEXT,
  "role" "ProductMediaRole" NOT NULL DEFAULT 'GALLERY',
  "url" TEXT NOT NULL DEFAULT '',
  "alt" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCategory" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "parentId" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCategoryAssignment" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCategoryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductBundleComponent" (
  "id" TEXT NOT NULL,
  "bundleProductId" TEXT NOT NULL,
  "componentProductId" TEXT NOT NULL,
  "componentVariantId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isOptional" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductBundleComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");
CREATE INDEX "ProductOption_productId_sortOrder_idx" ON "ProductOption"("productId", "sortOrder");

CREATE UNIQUE INDEX "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");
CREATE INDEX "ProductOptionValue_optionId_sortOrder_idx" ON "ProductOptionValue"("optionId", "sortOrder");

CREATE UNIQUE INDEX "ProductVariantOptionValue_variantId_optionValueId_key" ON "ProductVariantOptionValue"("variantId", "optionValueId");
CREATE INDEX "ProductVariantOptionValue_optionValueId_idx" ON "ProductVariantOptionValue"("optionValueId");

CREATE INDEX "ProductMedia_productId_sortOrder_idx" ON "ProductMedia"("productId", "sortOrder");
CREATE INDEX "ProductMedia_mediaAssetId_idx" ON "ProductMedia"("mediaAssetId");

CREATE UNIQUE INDEX "ProductCategory_siteId_slug_key" ON "ProductCategory"("siteId", "slug");
CREATE INDEX "ProductCategory_siteId_status_idx" ON "ProductCategory"("siteId", "status");
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");
CREATE INDEX "ProductCategory_isFeatured_idx" ON "ProductCategory"("isFeatured");

CREATE UNIQUE INDEX "ProductCategoryAssignment_categoryId_productId_key" ON "ProductCategoryAssignment"("categoryId", "productId");
CREATE INDEX "ProductCategoryAssignment_productId_idx" ON "ProductCategoryAssignment"("productId");

CREATE UNIQUE INDEX "ProductBundleComponent_bundleProductId_componentProductId_componentVariantId_key" ON "ProductBundleComponent"("bundleProductId", "componentProductId", "componentVariantId");
CREATE INDEX "ProductBundleComponent_componentProductId_idx" ON "ProductBundleComponent"("componentProductId");
CREATE INDEX "ProductBundleComponent_componentVariantId_idx" ON "ProductBundleComponent"("componentVariantId");

ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "ProductOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCategoryAssignment" ADD CONSTRAINT "ProductCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategoryAssignment" ADD CONSTRAINT "ProductCategoryAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ProductMedia" ("id", "productId", "role", "url", "alt", "sortOrder", "createdAt", "updatedAt")
SELECT 'pm_' || md5("id" || "imageUrl"), "id", 'PRIMARY', "imageUrl", "name", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product"
WHERE "imageUrl" <> ''
ON CONFLICT DO NOTHING;
