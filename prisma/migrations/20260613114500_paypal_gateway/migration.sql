CREATE TYPE "PayPalWebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "PayPalWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "PayPalWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "summary" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT NOT NULL DEFAULT '',
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayPalWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayPalWebhookEvent_eventId_key" ON "PayPalWebhookEvent"("eventId");
CREATE INDEX "PayPalWebhookEvent_status_idx" ON "PayPalWebhookEvent"("status");
CREATE INDEX "PayPalWebhookEvent_type_idx" ON "PayPalWebhookEvent"("type");
