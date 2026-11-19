ALTER TABLE "BillingPayment" ADD COLUMN "externalOrderId" TEXT;

UPDATE "BillingPayment"
SET "externalOrderId" = COALESCE(
  NULLIF("rawSummary" #>> '{checkoutSession,orderId}', ''),
  NULLIF("rawSummary" #>> '{payment,orderId}', '')
)
WHERE "provider" = 'SQUARE';

UPDATE "BillingPayment"
SET "externalPaymentId" = NULL
WHERE "provider" = 'SQUARE' AND "externalPaymentId" = "externalOrderId";
