CREATE TYPE "PortfolioGalleryLayout" AS ENUM ('GRID', 'MASONRY', 'EDITORIAL', 'CAROUSEL', 'BEFORE_AFTER');

ALTER TABLE "PortfolioGallery"
  ADD COLUMN "layout" "PortfolioGalleryLayout" NOT NULL DEFAULT 'GRID';
