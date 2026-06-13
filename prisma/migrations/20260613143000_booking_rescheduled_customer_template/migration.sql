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
  'email-template-booking-rescheduled-customer-' || "Site"."id",
  "Site"."id",
  'booking.rescheduled.customer',
  'Booking rescheduled',
  'Sent to the customer when an appointment is moved to a new time.',
  'BOOKING_CONFIRMATION',
  'EMAIL',
  'Your {{businessName}} appointment was rescheduled',
  'Your appointment time changed.',
  $$Hi {{customerName}},

Your {{serviceName}} appointment with {{businessName}} was rescheduled.

New time: {{appointmentTime}}$$,
  $$<p>Hi {{customerName}},</p><p>Your {{serviceName}} appointment with {{businessName}} was rescheduled.</p><p><strong>New time:</strong> {{appointmentTime}}</p>$$,
  $$Hi {{customerName}},

Your {{serviceName}} appointment with {{businessName}} was rescheduled.

New time: {{appointmentTime}}$$,
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
    AND "MessageTemplate"."key" = 'booking.rescheduled.customer'
);
