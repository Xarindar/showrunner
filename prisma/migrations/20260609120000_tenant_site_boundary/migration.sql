-- DropForeignKey
ALTER TABLE "ModuleSetting" DROP CONSTRAINT "ModuleSetting_moduleId_fkey";

-- DropIndex
DROP INDEX "AnalyticsEvent_eventType_idx";

-- DropIndex
DROP INDEX "AnalyticsGoal_isActive_idx";

-- DropIndex
DROP INDEX "AnalyticsGoal_key_key";

-- DropIndex
DROP INDEX "Automation_status_idx";

-- DropIndex
DROP INDEX "BillingDocument_documentNumber_key";

-- DropIndex
DROP INDEX "BillingDocument_publicAccessToken_key";

-- DropIndex
DROP INDEX "BillingDocument_type_status_idx";

-- DropIndex
DROP INDEX "Booking_startsAt_endsAt_idx";

-- DropIndex
DROP INDEX "Cart_status_idx";

-- DropIndex
DROP INDEX "Client_email_key";

-- DropIndex
DROP INDEX "Collection_slug_key";

-- DropIndex
DROP INDEX "Collection_status_idx";

-- DropIndex
DROP INDEX "Coupon_code_key";

-- DropIndex
DROP INDEX "Coupon_isActive_idx";

-- DropIndex
DROP INDEX "EmailCampaign_senderIdentityId_idx";

-- DropIndex
DROP INDEX "EmailCampaign_status_idx";

-- DropIndex
DROP INDEX "EmailOutbox_idempotencyKey_key";

-- DropIndex
DROP INDEX "EmailOutbox_templateId_idx";

-- DropIndex
DROP INDEX "EmailProviderEvent_eventKey_key";

-- DropIndex
DROP INDEX "EmailProviderEvent_outboxId_idx";

-- DropIndex
DROP INDEX "EmailRecipientGroup_key_key";

-- DropIndex
DROP INDEX "EmailSenderIdentity_sendingDomainId_idx";

-- DropIndex
DROP INDEX "EmailSendingDomain_domain_key";

-- DropIndex
DROP INDEX "EmailSubscriber_email_key";

-- DropIndex
DROP INDEX "EmailSubscriber_status_idx";

-- DropIndex
DROP INDEX "EmailSubscriptionList_isDefault_idx";

-- DropIndex
DROP INDEX "Form_slug_key";

-- DropIndex
DROP INDEX "Form_status_idx";

-- DropIndex
DROP INDEX "MediaAsset_folder_idx";

-- DropIndex
DROP INDEX "MessageLog_status_idx";

-- DropIndex
DROP INDEX "MessageTemplate_key_key";

-- DropIndex
DROP INDEX "MessageTemplate_purpose_idx";

-- DropIndex
DROP INDEX "ModuleInstallation_enabled_idx";

-- DropIndex
DROP INDEX "ModuleInstallation_moduleId_key";

-- DropIndex
DROP INDEX "ModuleSetting_moduleId_idx";

-- DropIndex
DROP INDEX "ModuleSetting_moduleId_key_key";

-- DropIndex
DROP INDEX "Order_orderNumber_key";

-- DropIndex
DROP INDEX "Order_status_idx";

-- DropIndex
DROP INDEX "PortfolioGallery_slug_key";

-- DropIndex
DROP INDEX "PortfolioGallery_status_idx";

-- DropIndex
DROP INDEX "PortfolioGalleryAccess_accessToken_key";

-- DropIndex
DROP INDEX "PortfolioGalleryAccess_galleryId_idx";

-- DropIndex
DROP INDEX "Product_slug_key";

-- DropIndex
DROP INDEX "Product_status_idx";

-- DropIndex
DROP INDEX "PublicRateLimit_key_key";

-- DropIndex
DROP INDEX "PublicRateLimit_scope_identifier_idx";

-- DropIndex
DROP INDEX "Service_slug_key";

-- DropIndex
DROP INDEX "SuppressionListEntry_email_key";

-- DropIndex
DROP INDEX "WebhookEndpoint_status_idx";

-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "AnalyticsGoal" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "AvailabilityRule" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "BillingDocument" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "BlockedTime" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailOutbox" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailProviderEvent" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailRecipientGroup" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailSenderIdentity" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailSendingDomain" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailSubscriber" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "EmailSubscriptionList" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "MessageLog" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "ModuleInstallation" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "ModuleSetting" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "PortfolioGallery" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "PortfolioGalleryAccess" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "PublicRateLimit" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "SuppressionListEntry" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "Testimonial" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- AlterTable
ALTER TABLE "WebhookEndpoint" ADD COLUMN     "siteId" TEXT NOT NULL DEFAULT 'site';

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDomain" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDomain_pkey" PRIMARY KEY ("id")
);

-- BackfillDefaultTenantSite
INSERT INTO "Tenant" ("id", "slug", "name", "createdAt", "updatedAt")
VALUES ('default-tenant', 'default', 'Default tenant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Site" ("id", "tenantId", "slug", "name", "isDefault", "createdAt", "updatedAt")
VALUES ('site', 'default-tenant', 'default', 'Default site', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Site_tenantId_idx" ON "Site"("tenantId");

-- CreateIndex
CREATE INDEX "Site_isDefault_idx" ON "Site"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Site_tenantId_slug_key" ON "Site"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SiteDomain_hostname_key" ON "SiteDomain"("hostname");

-- CreateIndex
CREATE INDEX "SiteDomain_siteId_idx" ON "SiteDomain"("siteId");

-- CreateIndex
CREATE INDEX "SiteDomain_isPrimary_idx" ON "SiteDomain"("isPrimary");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_siteId_eventType_idx" ON "AnalyticsEvent"("siteId", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsGoal_siteId_isActive_idx" ON "AnalyticsGoal"("siteId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsGoal_siteId_key_key" ON "AnalyticsGoal"("siteId", "key");

-- CreateIndex
CREATE INDEX "Automation_siteId_status_idx" ON "Automation"("siteId", "status");

-- CreateIndex
CREATE INDEX "AvailabilityRule_siteId_idx" ON "AvailabilityRule"("siteId");

-- CreateIndex
CREATE INDEX "BillingDocument_siteId_type_status_idx" ON "BillingDocument"("siteId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_siteId_documentNumber_key" ON "BillingDocument"("siteId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_siteId_publicAccessToken_key" ON "BillingDocument"("siteId", "publicAccessToken");

-- CreateIndex
CREATE INDEX "BlockedTime_siteId_startsAt_endsAt_idx" ON "BlockedTime"("siteId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Booking_siteId_startsAt_endsAt_idx" ON "Booking"("siteId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Cart_siteId_status_idx" ON "Cart"("siteId", "status");

-- CreateIndex
CREATE INDEX "Client_siteId_idx" ON "Client"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_siteId_email_key" ON "Client"("siteId", "email");

-- CreateIndex
CREATE INDEX "Collection_siteId_status_idx" ON "Collection"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_siteId_slug_key" ON "Collection"("siteId", "slug");

-- CreateIndex
CREATE INDEX "Coupon_siteId_isActive_idx" ON "Coupon"("siteId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_siteId_code_key" ON "Coupon"("siteId", "code");

-- CreateIndex
CREATE INDEX "EmailCampaign_siteId_senderIdentityId_idx" ON "EmailCampaign"("siteId", "senderIdentityId");

-- CreateIndex
CREATE INDEX "EmailCampaign_siteId_status_idx" ON "EmailCampaign"("siteId", "status");

-- CreateIndex
CREATE INDEX "EmailOutbox_siteId_templateId_idx" ON "EmailOutbox"("siteId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_siteId_idempotencyKey_key" ON "EmailOutbox"("siteId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_siteId_outboxId_idx" ON "EmailProviderEvent"("siteId", "outboxId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailProviderEvent_siteId_eventKey_key" ON "EmailProviderEvent"("siteId", "eventKey");

-- CreateIndex
CREATE INDEX "EmailRecipientGroup_siteId_idx" ON "EmailRecipientGroup"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailRecipientGroup_siteId_key_key" ON "EmailRecipientGroup"("siteId", "key");

-- CreateIndex
CREATE INDEX "EmailSenderIdentity_siteId_sendingDomainId_idx" ON "EmailSenderIdentity"("siteId", "sendingDomainId");

-- CreateIndex
CREATE INDEX "EmailSendingDomain_siteId_idx" ON "EmailSendingDomain"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendingDomain_siteId_domain_key" ON "EmailSendingDomain"("siteId", "domain");

-- CreateIndex
CREATE INDEX "EmailSubscriber_siteId_status_idx" ON "EmailSubscriber"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_siteId_email_key" ON "EmailSubscriber"("siteId", "email");

-- CreateIndex
CREATE INDEX "EmailSubscriptionList_siteId_isDefault_idx" ON "EmailSubscriptionList"("siteId", "isDefault");

-- CreateIndex
CREATE INDEX "Form_siteId_status_idx" ON "Form"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Form_siteId_slug_key" ON "Form"("siteId", "slug");

-- CreateIndex
CREATE INDEX "MediaAsset_siteId_folder_idx" ON "MediaAsset"("siteId", "folder");

-- CreateIndex
CREATE INDEX "MessageLog_siteId_status_idx" ON "MessageLog"("siteId", "status");

-- CreateIndex
CREATE INDEX "MessageTemplate_siteId_purpose_idx" ON "MessageTemplate"("siteId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_siteId_key_key" ON "MessageTemplate"("siteId", "key");

-- CreateIndex
CREATE INDEX "ModuleInstallation_siteId_enabled_idx" ON "ModuleInstallation"("siteId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleInstallation_siteId_moduleId_key" ON "ModuleInstallation"("siteId", "moduleId");

-- CreateIndex
CREATE INDEX "ModuleSetting_siteId_moduleId_idx" ON "ModuleSetting"("siteId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleSetting_siteId_moduleId_key_key" ON "ModuleSetting"("siteId", "moduleId", "key");

-- CreateIndex
CREATE INDEX "Order_siteId_status_idx" ON "Order"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_siteId_orderNumber_key" ON "Order"("siteId", "orderNumber");

-- CreateIndex
CREATE INDEX "PortfolioGallery_siteId_status_idx" ON "PortfolioGallery"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioGallery_siteId_slug_key" ON "PortfolioGallery"("siteId", "slug");

-- CreateIndex
CREATE INDEX "PortfolioGalleryAccess_siteId_galleryId_idx" ON "PortfolioGalleryAccess"("siteId", "galleryId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioGalleryAccess_siteId_accessToken_key" ON "PortfolioGalleryAccess"("siteId", "accessToken");

-- CreateIndex
CREATE INDEX "Product_siteId_status_idx" ON "Product"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_siteId_slug_key" ON "Product"("siteId", "slug");

-- CreateIndex
CREATE INDEX "PublicRateLimit_siteId_scope_identifier_idx" ON "PublicRateLimit"("siteId", "scope", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "PublicRateLimit_siteId_key_key" ON "PublicRateLimit"("siteId", "key");

-- CreateIndex
CREATE INDEX "Service_siteId_idx" ON "Service"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_siteId_slug_key" ON "Service"("siteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_siteId_key" ON "SiteSettings"("siteId");

-- CreateIndex
CREATE INDEX "SuppressionListEntry_siteId_idx" ON "SuppressionListEntry"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionListEntry_siteId_email_key" ON "SuppressionListEntry"("siteId", "email");

-- CreateIndex
CREATE INDEX "Testimonial_siteId_idx" ON "Testimonial"("siteId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_siteId_status_idx" ON "WebhookEndpoint"("siteId", "status");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsGoal" ADD CONSTRAINT "AnalyticsGoal_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionListEntry" ADD CONSTRAINT "SuppressionListEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendingDomain" ADD CONSTRAINT "EmailSendingDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSenderIdentity" ADD CONSTRAINT "EmailSenderIdentity_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailRecipientGroup" ADD CONSTRAINT "EmailRecipientGroup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailProviderEvent" ADD CONSTRAINT "EmailProviderEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSubscriptionList" ADD CONSTRAINT "EmailSubscriptionList_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSubscriber" ADD CONSTRAINT "EmailSubscriber_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDomain" ADD CONSTRAINT "SiteDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicRateLimit" ADD CONSTRAINT "PublicRateLimit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstallation" ADD CONSTRAINT "ModuleInstallation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleSetting" ADD CONSTRAINT "ModuleSetting_siteId_moduleId_fkey" FOREIGN KEY ("siteId", "moduleId") REFERENCES "ModuleInstallation"("siteId", "moduleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGallery" ADD CONSTRAINT "PortfolioGallery_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGalleryAccess" ADD CONSTRAINT "PortfolioGalleryAccess_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedTime" ADD CONSTRAINT "BlockedTime_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
