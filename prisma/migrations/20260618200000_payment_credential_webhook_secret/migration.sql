ALTER TABLE "PaymentGatewayCredential"
  ADD COLUMN "encryptedWebhookSecret" TEXT NOT NULL DEFAULT '';
