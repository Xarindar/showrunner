-- Add client-facing billing readiness fields without changing existing document statuses.
ALTER TABLE "BillingDocument" ADD COLUMN "publicAccessToken" TEXT;
ALTER TABLE "BillingDocument" ADD COLUMN "snapshot" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "BillingDocument" ADD COLUMN "snapshotAt" TIMESTAMP(3);
ALTER TABLE "BillingDocument" ADD COLUMN "checkoutProvider" "PaymentProvider";
ALTER TABLE "BillingDocument" ADD COLUMN "checkoutUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BillingDocument" ADD COLUMN "paymentExternalReference" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "BillingDocument_publicAccessToken_key" ON "BillingDocument"("publicAccessToken");
