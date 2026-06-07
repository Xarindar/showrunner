-- CreateEnum
CREATE TYPE "EmailSendingDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailCheckStatus" AS ENUM ('UNKNOWN', 'PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "EmailSuppressionScope" AS ENUM ('MARKETING', 'TRANSACTIONAL', 'ALL');

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('TRANSACTIONAL', 'ADMIN', 'MARKETING');

-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EmailProviderEventType" AS ENUM ('ACCEPTED', 'DELIVERED', 'DELIVERY_DELAYED', 'BOUNCED', 'COMPLAINED', 'OPENED', 'CLICKED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "EmailSubscriberStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'PENDING', 'BOUNCED');

-- CreateEnum
CREATE TYPE "EmailListMembershipStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'PENDING');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED');

-- AlterTable
ALTER TABLE "MessageTemplate"
ADD COLUMN "key" TEXT,
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "previewText" TEXT NOT NULL DEFAULT '',
ADD COLUMN "htmlBody" TEXT NOT NULL DEFAULT '',
ADD COLUMN "textBody" TEXT NOT NULL DEFAULT '',
ADD COLUMN "requiredTokens" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "optionalTokens" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "senderIdentityId" TEXT,
ADD COLUMN "isMarketing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SuppressionListEntry"
ADD COLUMN "scope" "EmailSuppressionScope" NOT NULL DEFAULT 'MARKETING';

-- CreateTable
CREATE TABLE "EmailSendingDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "EmailSendingDomainStatus" NOT NULL DEFAULT 'PENDING',
    "spfStatus" "EmailCheckStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dkimStatus" "EmailCheckStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dmarcStatus" "EmailCheckStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSendingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSenderIdentity" (
    "id" TEXT NOT NULL,
    "sendingDomainId" TEXT,
    "name" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSenderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRecipientGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fallbackToContactEmail" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRecipientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRecipient" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSubscriptionList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSubscriptionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "status" "EmailSubscriberStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentSource" TEXT NOT NULL DEFAULT '',
    "consentedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL DEFAULT '',
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "senderIdentityId" TEXT,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "targetListIds" JSONB NOT NULL DEFAULT '[]',
    "postalAddressSnapshot" TEXT NOT NULL DEFAULT '',
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "templateId" TEXT,
    "templateKey" TEXT NOT NULL DEFAULT '',
    "senderIdentityId" TEXT,
    "campaignId" TEXT,
    "subscriberId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL DEFAULT '',
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "purpose" TEXT NOT NULL DEFAULT 'general',
    "category" "EmailCategory" NOT NULL DEFAULT 'TRANSACTIONAL',
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT NOT NULL DEFAULT '',
    "providerMessageId" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailProviderEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "outboxId" TEXT,
    "providerMessageId" TEXT NOT NULL DEFAULT '',
    "eventType" "EmailProviderEventType" NOT NULL,
    "providerPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailListMembership" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "status" "EmailListMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "EmailListMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_key_key" ON "MessageTemplate"("key");

-- CreateIndex
CREATE INDEX "MessageTemplate_senderIdentityId_idx" ON "MessageTemplate"("senderIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendingDomain_domain_key" ON "EmailSendingDomain"("domain");

-- CreateIndex
CREATE INDEX "EmailSenderIdentity_sendingDomainId_idx" ON "EmailSenderIdentity"("sendingDomainId");

-- CreateIndex
CREATE INDEX "EmailSenderIdentity_isDefault_idx" ON "EmailSenderIdentity"("isDefault");

-- CreateIndex
CREATE INDEX "EmailSenderIdentity_fromEmail_idx" ON "EmailSenderIdentity"("fromEmail");

-- CreateIndex
CREATE UNIQUE INDEX "EmailRecipientGroup_key_key" ON "EmailRecipientGroup"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EmailRecipient_groupId_email_key" ON "EmailRecipient"("groupId", "email");

-- CreateIndex
CREATE INDEX "EmailRecipient_email_idx" ON "EmailRecipient"("email");

-- CreateIndex
CREATE INDEX "EmailRecipient_isActive_idx" ON "EmailRecipient"("isActive");

-- CreateIndex
CREATE INDEX "EmailSubscriptionList_isDefault_idx" ON "EmailSubscriptionList"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_email_key" ON "EmailSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_unsubscribeToken_key" ON "EmailSubscriber"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "EmailSubscriber_clientId_idx" ON "EmailSubscriber"("clientId");

-- CreateIndex
CREATE INDEX "EmailSubscriber_status_idx" ON "EmailSubscriber"("status");

-- CreateIndex
CREATE INDEX "EmailCampaign_senderIdentityId_idx" ON "EmailCampaign"("senderIdentityId");

-- CreateIndex
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key" ON "EmailOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailOutbox_templateId_idx" ON "EmailOutbox"("templateId");

-- CreateIndex
CREATE INDEX "EmailOutbox_senderIdentityId_idx" ON "EmailOutbox"("senderIdentityId");

-- CreateIndex
CREATE INDEX "EmailOutbox_campaignId_idx" ON "EmailOutbox"("campaignId");

-- CreateIndex
CREATE INDEX "EmailOutbox_subscriberId_idx" ON "EmailOutbox"("subscriberId");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_recipientEmail_idx" ON "EmailOutbox"("recipientEmail");

-- CreateIndex
CREATE INDEX "EmailOutbox_providerMessageId_idx" ON "EmailOutbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailOutbox_relatedType_relatedId_idx" ON "EmailOutbox"("relatedType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailProviderEvent_eventKey_key" ON "EmailProviderEvent"("eventKey");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_outboxId_idx" ON "EmailProviderEvent"("outboxId");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_providerMessageId_idx" ON "EmailProviderEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_eventType_idx" ON "EmailProviderEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "EmailListMembership_subscriberId_listId_key" ON "EmailListMembership"("subscriberId", "listId");

-- CreateIndex
CREATE INDEX "EmailListMembership_listId_idx" ON "EmailListMembership"("listId");

-- CreateIndex
CREATE INDEX "EmailListMembership_status_idx" ON "EmailListMembership"("status");

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_senderIdentityId_fkey" FOREIGN KEY ("senderIdentityId") REFERENCES "EmailSenderIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSenderIdentity" ADD CONSTRAINT "EmailSenderIdentity_sendingDomainId_fkey" FOREIGN KEY ("sendingDomainId") REFERENCES "EmailSendingDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailRecipient" ADD CONSTRAINT "EmailRecipient_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "EmailRecipientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSubscriber" ADD CONSTRAINT "EmailSubscriber_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_senderIdentityId_fkey" FOREIGN KEY ("senderIdentityId") REFERENCES "EmailSenderIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_senderIdentityId_fkey" FOREIGN KEY ("senderIdentityId") REFERENCES "EmailSenderIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "EmailSubscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailProviderEvent" ADD CONSTRAINT "EmailProviderEvent_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "EmailOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailListMembership" ADD CONSTRAINT "EmailListMembership_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "EmailSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailListMembership" ADD CONSTRAINT "EmailListMembership_listId_fkey" FOREIGN KEY ("listId") REFERENCES "EmailSubscriptionList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default sender, admin routes, and operational templates for existing installs.
INSERT INTO "EmailSenderIdentity" ("id", "name", "fromEmail", "replyToEmail", "isDefault", "isVerified", "createdAt", "updatedAt")
VALUES ('email-sender-default', 'Showrunner', 'admin@example.com', 'admin@example.com', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "EmailSenderIdentity"
SET
  "name" = "SiteSettings"."businessName",
  "fromEmail" = "SiteSettings"."contactEmail",
  "replyToEmail" = "SiteSettings"."contactEmail",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "SiteSettings"
WHERE "EmailSenderIdentity"."id" = 'email-sender-default'
  AND "SiteSettings"."id" = 'site';

INSERT INTO "EmailRecipientGroup" ("id", "key", "label", "fallbackToContactEmail", "isActive", "createdAt", "updatedAt")
VALUES
  ('email-group-bookings', 'bookings', 'Bookings', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('email-group-forms', 'forms', 'Forms', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('email-group-billing', 'billing', 'Billing', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('email-group-campaigns', 'campaigns', 'Campaigns', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('email-group-system', 'system', 'System', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "EmailRecipient" ("id", "groupId", "email", "name", "isActive", "createdAt", "updatedAt")
SELECT 'email-recipient-bookings-contact', 'email-group-bookings', "contactEmail", "businessName", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SiteSettings"
WHERE "id" = 'site'
ON CONFLICT ("groupId", "email") DO NOTHING;

INSERT INTO "EmailRecipient" ("id", "groupId", "email", "name", "isActive", "createdAt", "updatedAt")
SELECT 'email-recipient-forms-contact', 'email-group-forms', "contactEmail", "businessName", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SiteSettings"
WHERE "id" = 'site'
ON CONFLICT ("groupId", "email") DO NOTHING;

INSERT INTO "EmailSubscriptionList" ("id", "name", "description", "isDefault", "createdAt", "updatedAt")
VALUES ('email-list-newsletter', 'Newsletter', 'Default marketing list for site updates and announcements.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MessageTemplate" (
  "id",
  "key",
  "name",
  "description",
  "purpose",
  "channel",
  "subject",
  "previewText",
  "body",
  "htmlBody",
  "textBody",
  "tokens",
  "requiredTokens",
  "optionalTokens",
  "version",
  "senderIdentityId",
  "isMarketing",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'email-template-booking-created-customer',
  'booking.created.customer',
  'Booking request received',
  'Sent to the customer after a public booking request is saved.',
  'BOOKING_CONFIRMATION',
  'EMAIL',
  '{{businessName}} appointment request',
  'Your appointment request was received.',
  $$Thanks, {{customerName}}.

Your {{serviceName}} appointment request was received by {{businessName}}.

Time: {{appointmentTime}}

The business will follow up if anything needs to change.$$,
  $$<p>Thanks, {{customerName}}.</p><p>Your {{serviceName}} appointment request was received by {{businessName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p>The business will follow up if anything needs to change.</p>$$,
  $$Thanks, {{customerName}}.

Your {{serviceName}} appointment request was received by {{businessName}}.

Time: {{appointmentTime}}

The business will follow up if anything needs to change.$$,
  '["businessName","customerName","serviceName","appointmentTime"]',
  '["businessName","customerName","serviceName","appointmentTime"]',
  '["customerEmail","timezone"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'email-template-booking-created-admin',
  'booking.created.admin',
  'New booking alert',
  'Sent to booking admins after a public booking request is saved.',
  'ADMIN_DIGEST',
  'EMAIL',
  'New booking: {{serviceName}}',
  '{{customerName}} booked {{serviceName}}.',
  $${{customerName}} booked {{serviceName}}.

Time: {{appointmentTime}}
Customer email: {{customerEmail}}$$,
  $$<p>{{customerName}} booked {{serviceName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p><strong>Customer email:</strong> {{customerEmail}}</p>$$,
  $${{customerName}} booked {{serviceName}}.

Time: {{appointmentTime}}
Customer email: {{customerEmail}}$$,
  '["customerName","customerEmail","serviceName","appointmentTime"]',
  '["customerName","customerEmail","serviceName","appointmentTime"]',
  '["businessName","timezone"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'email-template-booking-confirmed-customer',
  'booking.confirmed.customer',
  'Booking confirmed',
  'Sent to the customer when an appointment is confirmed.',
  'BOOKING_CONFIRMATION',
  'EMAIL',
  'Your {{businessName}} appointment is confirmed',
  'Your appointment is confirmed.',
  $$Hi {{customerName}},

Your {{serviceName}} appointment with {{businessName}} is confirmed.

Time: {{appointmentTime}}$$,
  $$<p>Hi {{customerName}},</p><p>Your {{serviceName}} appointment with {{businessName}} is confirmed.</p><p><strong>Time:</strong> {{appointmentTime}}</p>$$,
  $$Hi {{customerName}},

Your {{serviceName}} appointment with {{businessName}} is confirmed.

Time: {{appointmentTime}}$$,
  '["businessName","customerName","serviceName","appointmentTime"]',
  '["businessName","customerName","serviceName","appointmentTime"]',
  '["customerEmail","timezone"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'email-template-booking-canceled-customer',
  'booking.canceled.customer',
  'Booking canceled',
  'Sent to the customer when an appointment is canceled.',
  'GENERAL',
  'EMAIL',
  'Your {{businessName}} appointment was canceled',
  'Your appointment was canceled.',
  $$Hi {{customerName}},

Your {{serviceName}} appointment with {{businessName}} was canceled.

Time: {{appointmentTime}}

Reason: {{cancellationReason}}$$,
  $$<p>Hi {{customerName}},</p><p>Your {{serviceName}} appointment with {{businessName}} was canceled.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p><strong>Reason:</strong> {{cancellationReason}}</p>$$,
  $$Hi {{customerName}},

Your {{serviceName}} appointment with {{businessName}} was canceled.

Time: {{appointmentTime}}

Reason: {{cancellationReason}}$$,
  '["businessName","customerName","serviceName","appointmentTime","cancellationReason"]',
  '["businessName","customerName","serviceName","appointmentTime"]',
  '["customerEmail","timezone","cancellationReason"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'email-template-booking-delayed-customer',
  'booking.delayed.customer',
  'Booking delay notice',
  'Sent to the customer when an appointment delay is recorded.',
  'GENERAL',
  'EMAIL',
  'Update about your {{businessName}} appointment',
  'There is an update about your appointment.',
  $$Hi {{customerName}},

There is an update about your {{serviceName}} appointment with {{businessName}}.

Time: {{appointmentTime}}

Reason: {{delayReason}}$$,
  $$<p>Hi {{customerName}},</p><p>There is an update about your {{serviceName}} appointment with {{businessName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p><strong>Reason:</strong> {{delayReason}}</p>$$,
  $$Hi {{customerName}},

There is an update about your {{serviceName}} appointment with {{businessName}}.

Time: {{appointmentTime}}

Reason: {{delayReason}}$$,
  '["businessName","customerName","serviceName","appointmentTime","delayReason"]',
  '["businessName","customerName","serviceName","appointmentTime"]',
  '["customerEmail","timezone","delayReason"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'email-template-booking-completed-admin',
  'booking.completed.admin',
  'Booking completed alert',
  'Sent to booking admins when an appointment is marked completed.',
  'ADMIN_DIGEST',
  'EMAIL',
  'Completed booking: {{serviceName}}',
  '{{customerName}} was marked completed.',
  $${{customerName}} was marked completed for {{serviceName}}.

Time: {{appointmentTime}}$$,
  $$<p>{{customerName}} was marked completed for {{serviceName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p>$$,
  $${{customerName}} was marked completed for {{serviceName}}.

Time: {{appointmentTime}}$$,
  '["customerName","serviceName","appointmentTime"]',
  '["customerName","serviceName","appointmentTime"]',
  '["businessName","customerEmail","timezone"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'email-template-form-submitted-admin',
  'form.submitted.admin',
  'Form submission alert',
  'Sent to form admins after a public form is submitted.',
  'FORM_SUBMISSION',
  'EMAIL',
  'New form submission: {{formName}}',
  '{{submitterName}} submitted {{formName}}.',
  $$A form was submitted.

Form: {{formName}}
Name: {{submitterName}}
Email: {{submitterEmail}}

{{submissionSummary}}$$,
  $$<p>A form was submitted.</p><p><strong>Form:</strong> {{formName}}</p><p><strong>Name:</strong> {{submitterName}}</p><p><strong>Email:</strong> {{submitterEmail}}</p><p>{{submissionSummary}}</p>$$,
  $$A form was submitted.

Form: {{formName}}
Name: {{submitterName}}
Email: {{submitterEmail}}

{{submissionSummary}}$$,
  '["formName","submitterName","submitterEmail","submissionSummary"]',
  '["formName","submissionSummary"]',
  '["businessName","submitterName","submitterEmail"]',
  1,
  'email-sender-default',
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
