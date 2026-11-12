ALTER TABLE "PortfolioGallery" ADD COLUMN "processingUploads" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "processingStartedAt" TIMESTAMP(3), ADD COLUMN "processingError" TEXT NOT NULL DEFAULT '';
