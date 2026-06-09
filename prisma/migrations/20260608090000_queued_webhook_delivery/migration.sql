-- AlterTable
ALTER TABLE "Automation" ADD COLUMN "webhookSigningSecret" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "WebhookDelivery" ALTER COLUMN "webhookEndpointId" DROP NOT NULL;
ALTER TABLE "WebhookDelivery" ADD COLUMN "automationId" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN "targetUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebhookDelivery" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WebhookDelivery" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "WebhookDelivery" ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "WebhookDelivery_automationId_idx" ON "WebhookDelivery"("automationId");
CREATE INDEX "WebhookDelivery_nextAttemptAt_idx" ON "WebhookDelivery"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
