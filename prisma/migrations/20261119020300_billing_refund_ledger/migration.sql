ALTER TABLE "BillingPayment"
  ADD COLUMN "legacyRefundedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundLedgerStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "captureRejectionReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "checkoutOperation" BOOLEAN NOT NULL DEFAULT false;
UPDATE "BillingPayment" SET "legacyRefundedCents" = "refundedCents" WHERE "refundedCents" > 0;
UPDATE "BillingPayment" SET "captureRejectionReason" = "rawSummary" ->> 'rejectedReason'
WHERE "rawSummary" ->> 'rejectedReason' = 'payment_would_exceed_remaining_balance';
CREATE INDEX "BillingPayment_provider_externalOrderId_idx" ON "BillingPayment" ("provider", "externalOrderId");

CREATE TYPE "BillingRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TABLE "BillingRefund" (
  "id" TEXT PRIMARY KEY,
  "billingPaymentId" TEXT NOT NULL REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requested" BOOLEAN NOT NULL,
  "externalRefundId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "BillingRefundStatus" NOT NULL DEFAULT 'PENDING',
  "providerCreatedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "BillingRefund_billingPaymentId_externalRefundId_key" ON "BillingRefund" ("billingPaymentId", "externalRefundId");
CREATE INDEX "BillingRefund_requested_status_nextAttemptAt_idx" ON "BillingRefund" ("requested", "status", "nextAttemptAt");
