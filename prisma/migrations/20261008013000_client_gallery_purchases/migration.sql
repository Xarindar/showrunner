-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "extraPhotoPriceCents" INTEGER,
ADD COLUMN     "photoSelectionAllowance" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PortfolioGallery" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "extraPhotoPriceCents" INTEGER,
ADD COLUMN     "packageProductId" TEXT,
ADD COLUMN     "purchasedOrderId" TEXT,
ADD COLUMN     "selectionAllowance" INTEGER,
ADD COLUMN     "selectionCurrency" TEXT;

-- CreateTable
CREATE TABLE "PortfolioSelectionPurchase" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "packageProductId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "allowance" INTEGER NOT NULL,
    "extraPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "extraCount" INTEGER NOT NULL,
    "selectedCount" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "orderId" TEXT,
    "checkoutStartedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSelectionPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPurchasedSelection" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,

    CONSTRAINT "PortfolioPurchasedSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSelectionPurchase_galleryId_key" ON "PortfolioSelectionPurchase"("galleryId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSelectionPurchase_orderId_key" ON "PortfolioSelectionPurchase"("orderId");

-- CreateIndex
CREATE INDEX "PortfolioSelectionPurchase_siteId_clientId_idx" ON "PortfolioSelectionPurchase"("siteId", "clientId");

-- CreateIndex
CREATE INDEX "PortfolioPurchasedSelection_mediaAssetId_idx" ON "PortfolioPurchasedSelection"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPurchasedSelection_purchaseId_itemId_key" ON "PortfolioPurchasedSelection"("purchaseId", "itemId");

-- AddForeignKey
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_packageProductId_fkey" FOREIGN KEY ("packageProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_purchasedOrderId_fkey" FOREIGN KEY ("purchasedOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- NOT VALID preserves legacy dangling references without silently rewriting customer data.
-- New writes are checked. Audit existing rows before separately VALIDATE CONSTRAINT.
ALTER TABLE "PortfolioGalleryItem" ADD CONSTRAINT "PortfolioGalleryItem_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "PortfolioSelectionPurchase" ADD CONSTRAINT "PortfolioSelectionPurchase_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "PortfolioGallery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSelectionPurchase" ADD CONSTRAINT "PortfolioSelectionPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPurchasedSelection" ADD CONSTRAINT "PortfolioPurchasedSelection_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PortfolioSelectionPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPurchasedSelection" ADD CONSTRAINT "PortfolioPurchasedSelection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PortfolioGalleryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPurchasedSelection" ADD CONSTRAINT "PortfolioPurchasedSelection_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Finalized selection/pricing is append-only. A payment does not permit changing what was purchased.
CREATE FUNCTION protect_portfolio_purchase_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Finalized gallery purchases cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - 'checkoutStartedAt' - 'revokedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'checkoutStartedAt' - 'revokedAt') THEN
    RAISE EXCEPTION 'Finalized gallery purchase snapshots are immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
    RAISE EXCEPTION 'Gallery entitlement revocation is permanent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER portfolio_purchase_snapshot_immutable BEFORE UPDATE OR DELETE ON "PortfolioSelectionPurchase"
FOR EACH ROW EXECUTE FUNCTION protect_portfolio_purchase_snapshot();
CREATE FUNCTION protect_portfolio_selection_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Finalized gallery selections are immutable'; END $$;
CREATE TRIGGER portfolio_selection_snapshot_immutable BEFORE UPDATE OR DELETE ON "PortfolioPurchasedSelection"
FOR EACH ROW EXECUTE FUNCTION protect_portfolio_selection_snapshot();
ALTER TABLE "PortfolioSelectionPurchase" ADD CONSTRAINT "portfolio_purchase_amounts_nonnegative" CHECK ("allowance" >= 0 AND "extraPriceCents" >= 0 AND "extraCount" >= 0 AND "totalCents" >= 0 AND "totalCents" = "extraCount"::bigint * "extraPriceCents"::bigint);

CREATE FUNCTION check_portfolio_selection_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; actual integer;
BEGIN
  SELECT "selectedCount" INTO expected FROM "PortfolioSelectionPurchase" WHERE id = NEW."purchaseId";
  SELECT count(*) INTO actual FROM "PortfolioPurchasedSelection" WHERE "purchaseId" = NEW."purchaseId";
  IF actual <> expected THEN RAISE EXCEPTION 'Finalized gallery selection count cannot change'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER portfolio_selection_count_immutable AFTER INSERT ON "PortfolioPurchasedSelection"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_portfolio_selection_count();
ALTER TABLE "PortfolioSelectionPurchase" ADD CONSTRAINT "portfolio_selection_count_valid" CHECK ("selectedCount" BETWEEN 1 AND 2000 AND "extraCount" = GREATEST(0, "selectedCount" - "allowance"));

-- Permanent revocation is written only by verified provider-refund handlers.
-- Do not trigger it from Payment.refundedCents: existing refund actions reserve
-- that amount before calling the provider and roll it back when a refund fails.

CREATE INDEX "PortfolioGallery_siteId_clientId_idx" ON "PortfolioGallery"("siteId", "clientId");
CREATE INDEX "PortfolioGallery_packageProductId_idx" ON "PortfolioGallery"("packageProductId");
CREATE INDEX "PortfolioGallery_purchasedOrderId_idx" ON "PortfolioGallery"("purchasedOrderId");
