CREATE TABLE "BookingPaymentNotification" (
    "id" TEXT PRIMARY KEY,
    "billingDocumentId" TEXT NOT NULL REFERENCES "BillingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3)
);

CREATE INDEX "BookingPaymentNotification_completedAt_nextAttemptAt_idx"
ON "BookingPaymentNotification"("completedAt", "nextAttemptAt");
