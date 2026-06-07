-- CreateEnum
CREATE TYPE "PortfolioGalleryStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PortfolioGalleryVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'PASSWORD');

-- CreateEnum
CREATE TYPE "PortfolioItemType" AS ENUM ('IMAGE', 'VIDEO', 'FILE');

-- CreateEnum
CREATE TYPE "PortfolioAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('BOOKING_STARTED', 'BOOKING_COMPLETED', 'LEAD_SUBMITTED', 'GALLERY_VIEWED', 'FAVORITE_ADDED', 'VIEW_ITEM', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'PURCHASE', 'REFUND', 'INVOICE_PAID', 'CUSTOM');

-- CreateTable
CREATE TABLE "PortfolioGallery" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "PortfolioGalleryStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "PortfolioGalleryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "category" TEXT NOT NULL DEFAULT '',
    "coverImageUrl" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "shotAt" TIMESTAMP(3),
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "proofingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "downloadEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accessCodeHash" TEXT NOT NULL DEFAULT '',
    "rightsNotes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioGallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioGalleryItem" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "type" "PortfolioItemType" NOT NULL DEFAULT 'IMAGE',
    "title" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "altText" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "isDownloadable" BOOLEAN NOT NULL DEFAULT false,
    "isWatermarked" BOOLEAN NOT NULL DEFAULT false,
    "licenseNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioGalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioGalleryAccess" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "clientId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "PortfolioAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioGalleryAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioGalleryFavorite" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "clientId" TEXT,
    "viewerEmail" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioGalleryFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL DEFAULT 'CUSTOM',
    "eventName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "medium" TEXT NOT NULL DEFAULT '',
    "campaign" TEXT NOT NULL DEFAULT '',
    "landingPage" TEXT NOT NULL DEFAULT '',
    "referrer" TEXT NOT NULL DEFAULT '',
    "pathname" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "visitorId" TEXT NOT NULL DEFAULT '',
    "clientEmail" TEXT NOT NULL DEFAULT '',
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "valueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsGoal" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL DEFAULT 'CUSTOM',
    "eventName" TEXT NOT NULL DEFAULT '',
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "targetValueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioGallery_slug_key" ON "PortfolioGallery"("slug");

-- CreateIndex
CREATE INDEX "PortfolioGallery_status_idx" ON "PortfolioGallery"("status");

-- CreateIndex
CREATE INDEX "PortfolioGallery_visibility_idx" ON "PortfolioGallery"("visibility");

-- CreateIndex
CREATE INDEX "PortfolioGallery_category_idx" ON "PortfolioGallery"("category");

-- CreateIndex
CREATE INDEX "PortfolioGallery_sortOrder_idx" ON "PortfolioGallery"("sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioGalleryItem_galleryId_idx" ON "PortfolioGalleryItem"("galleryId");

-- CreateIndex
CREATE INDEX "PortfolioGalleryItem_mediaAssetId_idx" ON "PortfolioGalleryItem"("mediaAssetId");

-- CreateIndex
CREATE INDEX "PortfolioGalleryItem_isCover_idx" ON "PortfolioGalleryItem"("isCover");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioGalleryAccess_accessToken_key" ON "PortfolioGalleryAccess"("accessToken");

-- CreateIndex
CREATE INDEX "PortfolioGalleryAccess_galleryId_idx" ON "PortfolioGalleryAccess"("galleryId");

-- CreateIndex
CREATE INDEX "PortfolioGalleryAccess_recipientEmail_idx" ON "PortfolioGalleryAccess"("recipientEmail");

-- CreateIndex
CREATE INDEX "PortfolioGalleryAccess_status_idx" ON "PortfolioGalleryAccess"("status");

-- CreateIndex
CREATE INDEX "PortfolioGalleryFavorite_galleryId_idx" ON "PortfolioGalleryFavorite"("galleryId");

-- CreateIndex
CREATE INDEX "PortfolioGalleryFavorite_itemId_idx" ON "PortfolioGalleryFavorite"("itemId");

-- CreateIndex
CREATE INDEX "PortfolioGalleryFavorite_viewerEmail_idx" ON "PortfolioGalleryFavorite"("viewerEmail");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventType_idx" ON "AnalyticsEvent"("eventType");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventName_idx" ON "AnalyticsEvent"("eventName");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_source_idx" ON "AnalyticsEvent"("source");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_campaign_idx" ON "AnalyticsEvent"("campaign");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_relatedType_relatedId_idx" ON "AnalyticsEvent"("relatedType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsGoal_key_key" ON "AnalyticsGoal"("key");

-- CreateIndex
CREATE INDEX "AnalyticsGoal_isActive_idx" ON "AnalyticsGoal"("isActive");

-- CreateIndex
CREATE INDEX "AnalyticsGoal_eventType_idx" ON "AnalyticsGoal"("eventType");

-- AddForeignKey
ALTER TABLE "PortfolioGalleryItem" ADD CONSTRAINT "PortfolioGalleryItem_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGalleryAccess" ADD CONSTRAINT "PortfolioGalleryAccess_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGalleryFavorite" ADD CONSTRAINT "PortfolioGalleryFavorite_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGalleryFavorite" ADD CONSTRAINT "PortfolioGalleryFavorite_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PortfolioGalleryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
