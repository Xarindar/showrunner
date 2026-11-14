CREATE TABLE "PortfolioProofBundle" (
  "purchaseId" TEXT PRIMARY KEY REFERENCES "PortfolioSelectionPurchase"("id") ON DELETE RESTRICT,
  "accessId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "leaseUntil" TIMESTAMP(3),
  "driver" "MediaDriver",
  "key" TEXT,
  "sizeBytes" BIGINT
);
CREATE INDEX "PortfolioProofBundle_state_leaseUntil_idx" ON "PortfolioProofBundle"("state", "leaseUntil");
