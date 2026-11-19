CREATE TABLE "SquareReconciliationItem" (
  "siteId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("siteId", "eventId")
);
CREATE INDEX "SquareReconciliationItem_siteId_createdAt_idx" ON "SquareReconciliationItem" ("siteId", "createdAt");
