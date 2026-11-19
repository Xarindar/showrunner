ALTER TABLE "BillingDocument" ADD COLUMN "bookingId" TEXT, ADD COLUMN "bookingApprovalRequired" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "BillingDocument_bookingId_key" ON "BillingDocument"("bookingId");
CREATE INDEX "BillingDocument_publicAccessToken_idx" ON "BillingDocument"("publicAccessToken");
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
