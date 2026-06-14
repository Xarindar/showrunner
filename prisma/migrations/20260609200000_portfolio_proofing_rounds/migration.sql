-- CreateEnum
CREATE TYPE "PortfolioProofRoundStatus" AS ENUM ('OPEN', 'CHANGES_REQUESTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "PortfolioProofApprovalStatus" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "PortfolioProofItemStatus" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateTable
CREATE TABLE "PortfolioProofRound" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "status" "PortfolioProofRoundStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioProofRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioProofComment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "itemId" TEXT,
    "accessId" TEXT,
    "clientId" TEXT,
    "viewerEmail" TEXT NOT NULL DEFAULT '',
    "authorName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioProofComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioProofApproval" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "accessId" TEXT,
    "clientId" TEXT,
    "viewerEmail" TEXT NOT NULL DEFAULT '',
    "approverName" TEXT NOT NULL DEFAULT '',
    "status" "PortfolioProofApprovalStatus" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioProofApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioProofItemDecision" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessId" TEXT,
    "clientId" TEXT,
    "viewerEmail" TEXT NOT NULL DEFAULT '',
    "status" "PortfolioProofItemStatus" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioProofItemDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioProofRound_siteId_status_idx" ON "PortfolioProofRound"("siteId", "status");

-- CreateIndex
CREATE INDEX "PortfolioProofRound_galleryId_status_idx" ON "PortfolioProofRound"("galleryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioProofRound_galleryId_roundNumber_key" ON "PortfolioProofRound"("galleryId", "roundNumber");

-- CreateIndex
CREATE INDEX "PortfolioProofComment_siteId_galleryId_idx" ON "PortfolioProofComment"("siteId", "galleryId");

-- CreateIndex
CREATE INDEX "PortfolioProofComment_roundId_idx" ON "PortfolioProofComment"("roundId");

-- CreateIndex
CREATE INDEX "PortfolioProofComment_itemId_idx" ON "PortfolioProofComment"("itemId");

-- CreateIndex
CREATE INDEX "PortfolioProofComment_viewerEmail_idx" ON "PortfolioProofComment"("viewerEmail");

-- CreateIndex
CREATE INDEX "PortfolioProofApproval_siteId_galleryId_idx" ON "PortfolioProofApproval"("siteId", "galleryId");

-- CreateIndex
CREATE INDEX "PortfolioProofApproval_roundId_idx" ON "PortfolioProofApproval"("roundId");

-- CreateIndex
CREATE INDEX "PortfolioProofApproval_viewerEmail_idx" ON "PortfolioProofApproval"("viewerEmail");

-- CreateIndex
CREATE INDEX "PortfolioProofApproval_status_idx" ON "PortfolioProofApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioProofItemDecision_roundId_itemId_viewerEmail_key" ON "PortfolioProofItemDecision"("roundId", "itemId", "viewerEmail");

-- CreateIndex
CREATE INDEX "PortfolioProofItemDecision_siteId_galleryId_idx" ON "PortfolioProofItemDecision"("siteId", "galleryId");

-- CreateIndex
CREATE INDEX "PortfolioProofItemDecision_itemId_idx" ON "PortfolioProofItemDecision"("itemId");

-- CreateIndex
CREATE INDEX "PortfolioProofItemDecision_status_idx" ON "PortfolioProofItemDecision"("status");

-- AddForeignKey
ALTER TABLE "PortfolioProofRound" ADD CONSTRAINT "PortfolioProofRound_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofRound" ADD CONSTRAINT "PortfolioProofRound_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofComment" ADD CONSTRAINT "PortfolioProofComment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofComment" ADD CONSTRAINT "PortfolioProofComment_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofComment" ADD CONSTRAINT "PortfolioProofComment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PortfolioProofRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofComment" ADD CONSTRAINT "PortfolioProofComment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PortfolioGalleryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofComment" ADD CONSTRAINT "PortfolioProofComment_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "PortfolioGalleryAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofApproval" ADD CONSTRAINT "PortfolioProofApproval_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofApproval" ADD CONSTRAINT "PortfolioProofApproval_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofApproval" ADD CONSTRAINT "PortfolioProofApproval_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PortfolioProofRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofApproval" ADD CONSTRAINT "PortfolioProofApproval_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "PortfolioGalleryAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofItemDecision" ADD CONSTRAINT "PortfolioProofItemDecision_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofItemDecision" ADD CONSTRAINT "PortfolioProofItemDecision_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofItemDecision" ADD CONSTRAINT "PortfolioProofItemDecision_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PortfolioProofRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofItemDecision" ADD CONSTRAINT "PortfolioProofItemDecision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PortfolioGalleryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioProofItemDecision" ADD CONSTRAINT "PortfolioProofItemDecision_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "PortfolioGalleryAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;
