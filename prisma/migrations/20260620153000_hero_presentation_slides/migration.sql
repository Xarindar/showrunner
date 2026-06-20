-- CreateEnum
CREATE TYPE "HeroPresentationMode" AS ENUM ('STATIC', 'SLIDESHOW');

-- CreateEnum
CREATE TYPE "HeroSlideElementType" AS ENUM ('IMAGE', 'HEADLINE', 'CAPTION', 'CTA');

-- CreateTable
CREATE TABLE "HeroPresentation" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "mode" "HeroPresentationMode" NOT NULL DEFAULT 'STATIC',
  "autoplayIntervalMs" INTEGER NOT NULL DEFAULT 6500,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HeroPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroSlide" (
  "id" TEXT NOT NULL,
  "presentationId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "headline" TEXT NOT NULL DEFAULT '',
  "caption" TEXT NOT NULL DEFAULT '',
  "imageUrl" TEXT NOT NULL DEFAULT '/hero.svg',
  "ctaLabel" TEXT NOT NULL DEFAULT 'Book an appointment',
  "ctaHref" TEXT NOT NULL DEFAULT '/book',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HeroSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroSlideElement" (
  "id" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  "type" "HeroSlideElementType" NOT NULL,
  "gridColumn" INTEGER NOT NULL DEFAULT 1,
  "gridRow" INTEGER NOT NULL DEFAULT 1,
  "columnSpan" INTEGER NOT NULL DEFAULT 2,
  "rowSpan" INTEGER NOT NULL DEFAULT 1,
  "zIndex" INTEGER NOT NULL DEFAULT 1,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HeroSlideElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HeroPresentation_siteId_key" ON "HeroPresentation"("siteId");
CREATE INDEX "HeroSlide_presentationId_sortOrder_idx" ON "HeroSlide"("presentationId", "sortOrder");
CREATE UNIQUE INDEX "HeroSlideElement_slideId_type_key" ON "HeroSlideElement"("slideId", "type");
CREATE INDEX "HeroSlideElement_slideId_idx" ON "HeroSlideElement"("slideId");

-- AddForeignKey
ALTER TABLE "HeroPresentation"
  ADD CONSTRAINT "HeroPresentation_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HeroSlide"
  ADD CONSTRAINT "HeroSlide_presentationId_fkey"
  FOREIGN KEY ("presentationId") REFERENCES "HeroPresentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HeroSlideElement"
  ADD CONSTRAINT "HeroSlideElement_slideId_fkey"
  FOREIGN KEY ("slideId") REFERENCES "HeroSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill a single editable hero screen from existing SiteSettings records.
INSERT INTO "HeroPresentation" ("id", "siteId", "mode", "autoplayIntervalMs", "createdAt", "updatedAt")
SELECT
  'hero_presentation_' || md5(settings."siteId"),
  settings."siteId",
  'STATIC',
  6500,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "SiteSettings" settings
WHERE NOT EXISTS (
  SELECT 1 FROM "HeroPresentation" existing WHERE existing."siteId" = settings."siteId"
);

INSERT INTO "HeroSlide" (
  "id",
  "presentationId",
  "sortOrder",
  "headline",
  "caption",
  "imageUrl",
  "ctaLabel",
  "ctaHref",
  "createdAt",
  "updatedAt"
)
SELECT
  'hero_slide_' || md5(settings."siteId" || ':0'),
  presentation."id",
  0,
  settings."heroHeadline",
  settings."heroSubheadline",
  settings."heroImageUrl",
  'Book an appointment',
  '/book',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "SiteSettings" settings
JOIN "HeroPresentation" presentation ON presentation."siteId" = settings."siteId"
WHERE NOT EXISTS (
  SELECT 1 FROM "HeroSlide" slide WHERE slide."presentationId" = presentation."id"
);

INSERT INTO "HeroSlideElement" (
  "id",
  "slideId",
  "type",
  "gridColumn",
  "gridRow",
  "columnSpan",
  "rowSpan",
  "zIndex",
  "isVisible",
  "createdAt",
  "updatedAt"
)
SELECT
  'hero_element_' || md5(slide."id" || ':' || element."type"),
  slide."id",
  element."type"::"HeroSlideElementType",
  element."gridColumn",
  element."gridRow",
  element."columnSpan",
  element."rowSpan",
  element."zIndex",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "HeroSlide" slide
CROSS JOIN (
  VALUES
    ('IMAGE', 4, 1, 3, 4, 1),
    ('HEADLINE', 1, 1, 3, 1, 2),
    ('CAPTION', 1, 2, 3, 1, 3),
    ('CTA', 1, 3, 2, 1, 4)
) AS element("type", "gridColumn", "gridRow", "columnSpan", "rowSpan", "zIndex")
WHERE NOT EXISTS (
  SELECT 1
  FROM "HeroSlideElement" existing
  WHERE existing."slideId" = slide."id"
    AND existing."type" = element."type"::"HeroSlideElementType"
);
