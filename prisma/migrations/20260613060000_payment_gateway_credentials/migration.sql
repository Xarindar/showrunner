ALTER TYPE "PaymentProvider" ADD VALUE 'PAYPAL';

CREATE TYPE "PaymentGatewayConnectionStatus" AS ENUM ('DISCONNECTED', 'PENDING', 'CONNECTED', 'ERROR');

CREATE TABLE "PaymentGatewayCredential" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentGatewayConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "externalAccountId" TEXT NOT NULL DEFAULT '',
  "merchantId" TEXT NOT NULL DEFAULT '',
  "displayName" TEXT NOT NULL DEFAULT '',
  "encryptedAccessToken" TEXT NOT NULL DEFAULT '',
  "encryptedRefreshToken" TEXT NOT NULL DEFAULT '',
  "encryptedSecretKey" TEXT NOT NULL DEFAULT '',
  "webhookSecretHint" TEXT NOT NULL DEFAULT '',
  "supportedWallets" JSONB NOT NULL DEFAULT '[]',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "connectedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentGatewayCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentGatewayCredential_siteId_provider_key" ON "PaymentGatewayCredential"("siteId", "provider");
CREATE INDEX "PaymentGatewayCredential_siteId_status_idx" ON "PaymentGatewayCredential"("siteId", "status");
CREATE INDEX "PaymentGatewayCredential_provider_status_idx" ON "PaymentGatewayCredential"("provider", "status");

ALTER TABLE "PaymentGatewayCredential"
  ADD CONSTRAINT "PaymentGatewayCredential_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
