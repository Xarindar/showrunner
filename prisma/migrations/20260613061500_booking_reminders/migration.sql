CREATE TYPE "BookingReminderStatus" AS ENUM ('CLAIMED', 'QUEUED', 'FAILED');

CREATE TABLE "SchedulingSettings" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "bookingReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
  "bookingReminderLeadMinutes" INTEGER NOT NULL DEFAULT 1440,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchedulingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingReminder" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "leadMinutes" INTEGER NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "BookingReminderStatus" NOT NULL DEFAULT 'CLAIMED',
  "claimedAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulingSettings_siteId_key" ON "SchedulingSettings"("siteId");
CREATE UNIQUE INDEX "BookingReminder_bookingId_key" ON "BookingReminder"("bookingId");
CREATE INDEX "BookingReminder_siteId_scheduledFor_idx" ON "BookingReminder"("siteId", "scheduledFor");
CREATE INDEX "BookingReminder_siteId_status_idx" ON "BookingReminder"("siteId", "status");

ALTER TABLE "SchedulingSettings"
  ADD CONSTRAINT "SchedulingSettings_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingReminder"
  ADD CONSTRAINT "BookingReminder_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingReminder"
  ADD CONSTRAINT "BookingReminder_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MessageTemplate" (
  "id",
  "siteId",
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
  "isMarketing",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'email-template-booking-reminder-customer-' || "Site"."id",
  "Site"."id",
  'booking.reminder.customer',
  'Booking reminder',
  'Sent to the customer before an upcoming appointment.',
  'BOOKING_REMINDER',
  'EMAIL',
  'Reminder: {{serviceName}} with {{businessName}}',
  'Your appointment is coming up.',
  $$Hi {{customerName}},

This is a reminder for your {{serviceName}} appointment with {{businessName}}.

Time: {{appointmentTime}}$$,
  $$<p>Hi {{customerName}},</p><p>This is a reminder for your {{serviceName}} appointment with {{businessName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p>$$,
  $$Hi {{customerName}},

This is a reminder for your {{serviceName}} appointment with {{businessName}}.

Time: {{appointmentTime}}$$,
  '["businessName","customerName","serviceName","appointmentTime","customerEmail","timezone","bookingStatus"]'::jsonb,
  '["businessName","customerName","serviceName","appointmentTime"]'::jsonb,
  '["customerEmail","timezone","bookingStatus"]'::jsonb,
  1,
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Site"
WHERE NOT EXISTS (
  SELECT 1
  FROM "MessageTemplate"
  WHERE "MessageTemplate"."siteId" = "Site"."id"
    AND "MessageTemplate"."key" = 'booking.reminder.customer'
);
