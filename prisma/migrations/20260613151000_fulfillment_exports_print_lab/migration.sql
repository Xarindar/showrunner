-- Add order-level fulfillment export and print/photo lab handoff metadata.
ALTER TABLE "Order"
  ADD COLUMN "fulfillmentExportedAt" TIMESTAMP(3),
  ADD COLUMN "fulfillmentExportBatch" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "printLabName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "printLabReference" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "printLabHandoffAt" TIMESTAMP(3),
  ADD COLUMN "printLabNotes" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Order_siteId_fulfillmentExportedAt_idx" ON "Order"("siteId", "fulfillmentExportedAt");
CREATE INDEX "Order_siteId_printLabHandoffAt_idx" ON "Order"("siteId", "printLabHandoffAt");
