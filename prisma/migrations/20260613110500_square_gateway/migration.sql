ALTER TABLE "SiteSettings"
  ADD COLUMN "checkoutProvider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';

CREATE TYPE "SquareWebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "SquareWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL,
  "status" "SquareWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "summary" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT NOT NULL DEFAULT '',
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SquareWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SquareWebhookEvent_eventId_key" ON "SquareWebhookEvent"("eventId");
CREATE INDEX "SquareWebhookEvent_status_idx" ON "SquareWebhookEvent"("status");
CREATE INDEX "SquareWebhookEvent_type_idx" ON "SquareWebhookEvent"("type");
CREATE INDEX "SquareWebhookEvent_merchantId_idx" ON "SquareWebhookEvent"("merchantId");
