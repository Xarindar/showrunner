CREATE TABLE "BillingPayment" (
  "id" TEXT NOT NULL,
  "billingDocumentId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "externalPaymentId" TEXT,
  "externalCheckoutSession" TEXT,
  "hostedReceiptUrl" TEXT,
  "rawSummary" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingPayment_billingDocumentId_idx" ON "BillingPayment"("billingDocumentId");
CREATE INDEX "BillingPayment_provider_idx" ON "BillingPayment"("provider");
CREATE INDEX "BillingPayment_status_idx" ON "BillingPayment"("status");
CREATE INDEX "BillingPayment_externalCheckoutSession_idx" ON "BillingPayment"("externalCheckoutSession");
CREATE INDEX "BillingPayment_externalPaymentId_idx" ON "BillingPayment"("externalPaymentId");

ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_billingDocumentId_fkey" FOREIGN KEY ("billingDocumentId") REFERENCES "BillingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
