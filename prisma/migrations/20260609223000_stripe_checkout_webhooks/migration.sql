CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
  "livemode" BOOLEAN NOT NULL DEFAULT false,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT NOT NULL DEFAULT '',
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");
CREATE INDEX "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");
