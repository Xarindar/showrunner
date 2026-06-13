ALTER TABLE "Cart"
ADD COLUMN "abandonedAt" TIMESTAMP(3),
ADD COLUMN "recoveryEmailQueuedAt" TIMESTAMP(3),
ADD COLUMN "recoveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "recoveryLastError" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Cart_siteId_status_updatedAt_idx" ON "Cart"("siteId", "status", "updatedAt");

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
  "senderIdentityId",
  "isMarketing",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'email-template-cart-recovery-customer-' || s.id,
  s.id,
  'cart.recovery.customer',
  'Cart recovery',
  'Sent to subscribed customers when an open cart has been idle.',
  'MARKETING',
  'EMAIL',
  'Still interested in {{businessName}}?',
  'Your saved cart is waiting.',
  'Hi {{customerName}},

You left items in your {{businessName}} cart.

{{itemSummary}}

Cart total: {{cartTotal}}

Return to your cart: {{cartUrl}}

Unsubscribe: {{unsubscribeUrl}}',
  '<p>Hi {{customerName}},</p><p>You left items in your {{businessName}} cart.</p><p>{{itemSummary}}</p><p><strong>Cart total:</strong> {{cartTotal}}</p><p><a href="{{cartUrl}}">Return to your cart</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>',
  'Hi {{customerName}},

You left items in your {{businessName}} cart.

{{itemSummary}}

Cart total: {{cartTotal}}

Return to your cart: {{cartUrl}}

Unsubscribe: {{unsubscribeUrl}}',
  '["businessName","customerName","cartTotal","cartUrl","itemSummary","unsubscribeUrl","customerEmail"]'::jsonb,
  '["businessName","customerName","cartTotal","cartUrl","itemSummary","unsubscribeUrl"]'::jsonb,
  '["customerEmail"]'::jsonb,
  sender.id,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Site" s
LEFT JOIN LATERAL (
  SELECT "id"
  FROM "EmailSenderIdentity"
  WHERE "siteId" = s.id
  ORDER BY "isDefault" DESC, "createdAt" ASC
  LIMIT 1
) sender ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM "MessageTemplate" existing
  WHERE existing."siteId" = s.id
    AND existing."key" = 'cart.recovery.customer'
);
