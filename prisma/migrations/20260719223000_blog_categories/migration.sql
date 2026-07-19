-- CreateTable
CREATE TABLE "BlogCategory" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

-- Add the normalized relation before copying any legacy category values.
ALTER TABLE "BlogPost" ADD COLUMN "categoryId" TEXT;

WITH normalized AS (
    SELECT
        "siteId",
        trim("category") AS "name",
        COALESCE(
            NULLIF(trim(BOTH '-' FROM regexp_replace(lower(trim("category")), '[^a-z0-9]+', '-', 'g')), ''),
            'category'
        ) AS "slug"
    FROM "BlogPost"
    WHERE trim("category") <> ''
), unique_categories AS (
    SELECT DISTINCT ON ("siteId", "slug")
        "siteId",
        "name",
        "slug"
    FROM normalized
    ORDER BY "siteId", "slug", "name"
)
INSERT INTO "BlogCategory" ("id", "siteId", "name", "slug", "sortOrder", "createdAt", "updatedAt")
SELECT
    'blogcat_' || substr(md5("siteId" || ':' || "slug"), 1, 20),
    "siteId",
    "name",
    "slug",
    row_number() OVER (PARTITION BY "siteId" ORDER BY "name") - 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM unique_categories;

UPDATE "BlogPost" AS post
SET "categoryId" = category."id"
FROM "BlogCategory" AS category
WHERE category."siteId" = post."siteId"
  AND category."slug" = COALESCE(
      NULLIF(trim(BOTH '-' FROM regexp_replace(lower(trim(post."category")), '[^a-z0-9]+', '-', 'g')), ''),
      'category'
  )
  AND trim(post."category") <> '';

ALTER TABLE "BlogPost" DROP COLUMN "category";

-- CreateIndex
CREATE UNIQUE INDEX "BlogCategory_siteId_slug_key" ON "BlogCategory"("siteId", "slug");
CREATE INDEX "BlogCategory_siteId_sortOrder_idx" ON "BlogCategory"("siteId", "sortOrder");
CREATE INDEX "BlogPost_categoryId_idx" ON "BlogPost"("categoryId");

-- AddForeignKey
ALTER TABLE "BlogCategory" ADD CONSTRAINT "BlogCategory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
