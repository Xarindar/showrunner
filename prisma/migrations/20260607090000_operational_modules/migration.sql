-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageTemplatePurpose" AS ENUM ('BOOKING_CONFIRMATION', 'BOOKING_REMINDER', 'ORDER_RECEIPT', 'INVOICE_NOTICE', 'FORM_SUBMISSION', 'GALLERY_ACCESS', 'PASSWORD_MAGIC_LINK', 'ADMIN_DIGEST', 'MARKETING', 'GENERAL');

-- CreateEnum
CREATE TYPE "MessageLogStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "BillingDocumentType" AS ENUM ('INVOICE', 'QUOTE', 'CONTRACT');

-- CreateEnum
CREATE TYPE "BillingDocumentStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('BOOKING_CREATED', 'BOOKING_CANCELED', 'ORDER_PAID', 'FORM_SUBMITTED', 'GALLERY_APPROVED', 'CLIENT_TAGGED', 'INVOICE_OVERDUE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationAction" AS ENUM ('SEND_EMAIL', 'NOTIFY_ADMIN', 'CREATE_INVOICE', 'REQUEST_REVIEW', 'SEND_WEBHOOK');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "MessageTemplatePurpose" NOT NULL DEFAULT 'GENERAL',
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "tokens" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "clientId" TEXT,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "purpose" TEXT NOT NULL DEFAULT 'general',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "recipientPhone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "bodyPreview" TEXT NOT NULL DEFAULT '',
    "status" "MessageLogStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionListEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDocument" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "type" "BillingDocumentType" NOT NULL DEFAULT 'INVOICE',
    "status" "BillingDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "publicMemo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLineItem" (
    "id" TEXT NOT NULL,
    "billingDocumentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAttachment" (
    "id" TEXT NOT NULL,
    "billingDocumentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" "AutomationTrigger" NOT NULL DEFAULT 'MANUAL',
    "action" "AutomationAction" NOT NULL DEFAULT 'NOTIFY_ADMIN',
    "targetEmail" TEXT,
    "webhookUrl" TEXT,
    "subjectTemplate" TEXT NOT NULL DEFAULT '',
    "bodyTemplate" TEXT NOT NULL DEFAULT '',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerKey" TEXT NOT NULL DEFAULT '',
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "signingSecret" TEXT NOT NULL DEFAULT '',
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookEndpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "statusCode" INTEGER,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageTemplate_purpose_idx" ON "MessageTemplate"("purpose");

-- CreateIndex
CREATE INDEX "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");

-- CreateIndex
CREATE INDEX "MessageTemplate_isActive_idx" ON "MessageTemplate"("isActive");

-- CreateIndex
CREATE INDEX "MessageLog_templateId_idx" ON "MessageLog"("templateId");

-- CreateIndex
CREATE INDEX "MessageLog_clientId_idx" ON "MessageLog"("clientId");

-- CreateIndex
CREATE INDEX "MessageLog_status_idx" ON "MessageLog"("status");

-- CreateIndex
CREATE INDEX "MessageLog_recipientEmail_idx" ON "MessageLog"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionListEntry_email_key" ON "SuppressionListEntry"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_documentNumber_key" ON "BillingDocument"("documentNumber");

-- CreateIndex
CREATE INDEX "BillingDocument_clientId_idx" ON "BillingDocument"("clientId");

-- CreateIndex
CREATE INDEX "BillingDocument_type_status_idx" ON "BillingDocument"("type", "status");

-- CreateIndex
CREATE INDEX "BillingDocument_customerEmail_idx" ON "BillingDocument"("customerEmail");

-- CreateIndex
CREATE INDEX "BillingLineItem_billingDocumentId_idx" ON "BillingLineItem"("billingDocumentId");

-- CreateIndex
CREATE INDEX "BillingAttachment_billingDocumentId_idx" ON "BillingAttachment"("billingDocumentId");

-- CreateIndex
CREATE INDEX "Automation_status_idx" ON "Automation"("status");

-- CreateIndex
CREATE INDEX "Automation_trigger_idx" ON "Automation"("trigger");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_idx" ON "AutomationRun"("automationId");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_status_idx" ON "WebhookEndpoint"("status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookEndpointId_idx" ON "WebhookDelivery"("webhookEndpointId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLineItem" ADD CONSTRAINT "BillingLineItem_billingDocumentId_fkey" FOREIGN KEY ("billingDocumentId") REFERENCES "BillingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAttachment" ADD CONSTRAINT "BillingAttachment_billingDocumentId_fkey" FOREIGN KEY ("billingDocumentId") REFERENCES "BillingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable the newly active operational modules for existing single-site installs.
UPDATE "SiteSettings"
SET "enabledModules" = "enabledModules" || '["communications"]'::jsonb
WHERE NOT "enabledModules" @> '["communications"]'::jsonb;

UPDATE "SiteSettings"
SET "enabledModules" = "enabledModules" || '["billing"]'::jsonb
WHERE NOT "enabledModules" @> '["billing"]'::jsonb;

UPDATE "SiteSettings"
SET "enabledModules" = "enabledModules" || '["automation"]'::jsonb
WHERE NOT "enabledModules" @> '["automation"]'::jsonb;
