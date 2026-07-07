-- Add reusable booking images for services and service categories.
ALTER TABLE "Service"
  ADD COLUMN "imageUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "mediaAssetId" TEXT;

CREATE TABLE "ServiceCategory" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "mediaAssetId" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "imageUrl" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Service_mediaAssetId_idx" ON "Service"("mediaAssetId");
CREATE UNIQUE INDEX "ServiceCategory_siteId_slug_key" ON "ServiceCategory"("siteId", "slug");
CREATE INDEX "ServiceCategory_siteId_sortOrder_idx" ON "ServiceCategory"("siteId", "sortOrder");
CREATE INDEX "ServiceCategory_mediaAssetId_idx" ON "ServiceCategory"("mediaAssetId");

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceCategory"
  ADD CONSTRAINT "ServiceCategory_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceCategory"
  ADD CONSTRAINT "ServiceCategory_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH normalized_categories AS (
  SELECT
    "siteId",
    btrim("category") AS "name",
    min("createdAt") AS "firstSeenAt"
  FROM "Service"
  WHERE btrim("category") <> ''
  GROUP BY "siteId", btrim("category")
),
slugged_categories AS (
  SELECT
    "siteId",
    "name",
    COALESCE(
      NULLIF(
        regexp_replace(
          regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'),
          '(^-|-$)',
          '',
          'g'
        ),
        ''
      ),
      'general'
    ) AS "baseSlug",
    "firstSeenAt"
  FROM normalized_categories
),
numbered_categories AS (
  SELECT
    "siteId",
    "name",
    "baseSlug",
    row_number() OVER (PARTITION BY "siteId", "baseSlug" ORDER BY "name") - 1 AS "duplicateIndex",
    row_number() OVER (PARTITION BY "siteId" ORDER BY "firstSeenAt", "name") - 1 AS "sortOrder"
  FROM slugged_categories
),
final_categories AS (
  SELECT
    "siteId",
    "name",
    CASE
      WHEN "duplicateIndex" = 0 THEN "baseSlug"
      ELSE "baseSlug" || '-' || ("duplicateIndex" + 1)::text
    END AS "slug",
    "sortOrder"
  FROM numbered_categories
)
INSERT INTO "ServiceCategory" ("id", "siteId", "slug", "name", "sortOrder", "createdAt", "updatedAt")
SELECT
  'svc_cat_' || substr(md5("siteId" || ':' || "slug"), 1, 24),
  "siteId",
  "slug",
  "name",
  "sortOrder",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM final_categories
ON CONFLICT ("siteId", "slug") DO NOTHING;
