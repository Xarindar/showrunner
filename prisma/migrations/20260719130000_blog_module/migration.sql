-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "contentHtml" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "headerImageUrl" TEXT NOT NULL DEFAULT '',
    "authorName" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_siteId_slug_key" ON "BlogPost"("siteId", "slug");

-- CreateIndex
CREATE INDEX "BlogPost_siteId_status_publishedAt_idx" ON "BlogPost"("siteId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogPost_siteId_updatedAt_idx" ON "BlogPost"("siteId", "updatedAt");

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing sites should see the newly installed default module immediately.
UPDATE "SiteSettings"
SET "enabledModules" = CASE
  WHEN jsonb_typeof("enabledModules") = 'array' AND NOT ("enabledModules" ? 'blog')
    THEN "enabledModules" || '["blog"]'::jsonb
  ELSE "enabledModules"
END;
