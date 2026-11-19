ALTER TABLE "StripeWebhookEvent" ADD COLUMN "siteId" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "StripeWebhookEvent_siteId_eventId_key" ON "StripeWebhookEvent"("siteId", "eventId");
DROP INDEX "StripeWebhookEvent_eventId_key";

ALTER TABLE "SquareWebhookEvent" ADD COLUMN "siteId" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "SquareWebhookEvent_siteId_eventId_key" ON "SquareWebhookEvent"("siteId", "eventId");
DROP INDEX "SquareWebhookEvent_eventId_key";

ALTER TABLE "PayPalWebhookEvent" ADD COLUMN "siteId" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "PayPalWebhookEvent_siteId_eventId_key" ON "PayPalWebhookEvent"("siteId", "eventId");
DROP INDEX "PayPalWebhookEvent_eventId_key";
