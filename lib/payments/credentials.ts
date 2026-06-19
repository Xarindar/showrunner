import "server-only";

import crypto from "node:crypto";
import { PaymentGatewayConnectionStatus, PaymentProvider, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const algorithm = "aes-256-gcm";

type ConnectedCredentialInput = {
  accessToken?: string;
  displayName?: string;
  encryptedMetadata?: Prisma.InputJsonValue;
  expiresAt?: Date;
  externalAccountId?: string;
  merchantId?: string;
  provider: PaymentProvider;
  refreshToken?: string;
  secretKey?: string;
  siteId: string;
  supportedWallets?: string[];
  webhookSecret?: string;
  webhookSecretHint?: string;
};

export type PayPalSiteCredentials = {
  clientId: string;
  clientSecret: string;
  environment: "live" | "sandbox";
  merchantId: string;
  webhookId: string;
};

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function credentialSecret() {
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be set before storing payment gateway credentials.");
  }

  return secret || "local-dev-payment-credential-secret";
}

function encryptionKey() {
  return crypto.createHash("sha256").update(credentialSecret()).digest();
}

export function encryptGatewaySecret(value: string) {
  const plaintext = value.trim();
  if (!plaintext) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptGatewaySecret(value: string) {
  if (!value) return "";
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Payment gateway credential payload is not recognized.");
  }

  const decipher = crypto.createDecipheriv(algorithm, encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

export async function upsertConnectedGatewayCredential(input: ConnectedCredentialInput) {
  return prisma.paymentGatewayCredential.upsert({
    where: {
      siteId_provider: {
        siteId: input.siteId,
        provider: input.provider
      }
    },
    update: {
      connectedAt: new Date(),
      displayName: input.displayName?.trim() || "",
      encryptedAccessToken: input.accessToken === undefined ? undefined : encryptGatewaySecret(input.accessToken),
      encryptedRefreshToken: input.refreshToken === undefined ? undefined : encryptGatewaySecret(input.refreshToken),
      encryptedSecretKey: input.secretKey === undefined ? undefined : encryptGatewaySecret(input.secretKey),
      encryptedWebhookSecret: input.webhookSecret === undefined ? undefined : encryptGatewaySecret(input.webhookSecret),
      expiresAt: input.expiresAt,
      externalAccountId: input.externalAccountId?.trim() || "",
      lastVerifiedAt: new Date(),
      merchantId: input.merchantId?.trim() || "",
      metadata: input.encryptedMetadata ?? {},
      status: PaymentGatewayConnectionStatus.CONNECTED,
      supportedWallets: input.supportedWallets ?? [],
      webhookSecretHint: input.webhookSecretHint?.trim() || ""
    },
    create: {
      connectedAt: new Date(),
      displayName: input.displayName?.trim() || "",
      encryptedAccessToken: encryptGatewaySecret(input.accessToken || ""),
      encryptedRefreshToken: encryptGatewaySecret(input.refreshToken || ""),
      encryptedSecretKey: encryptGatewaySecret(input.secretKey || ""),
      encryptedWebhookSecret: encryptGatewaySecret(input.webhookSecret || ""),
      expiresAt: input.expiresAt,
      externalAccountId: input.externalAccountId?.trim() || "",
      lastVerifiedAt: new Date(),
      merchantId: input.merchantId?.trim() || "",
      metadata: input.encryptedMetadata ?? {},
      provider: input.provider,
      siteId: input.siteId,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      supportedWallets: input.supportedWallets ?? [],
      webhookSecretHint: input.webhookSecretHint?.trim() || ""
    }
  });
}

export async function getConnectedGatewayCredential(siteId: string, provider: PaymentProvider) {
  return prisma.paymentGatewayCredential.findUnique({
    where: {
      siteId_provider: {
        siteId,
        provider
      }
    }
  });
}

function credentialMetadata(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
}

function metadataString(metadata: Prisma.JsonObject, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function isConnected(credential: { encryptedSecretKey?: string; status: PaymentGatewayConnectionStatus } | null) {
  return credential?.status === PaymentGatewayConnectionStatus.CONNECTED;
}

// Stripe API key the merchant pasted for this site (direct-charge model). Empty string when not
// configured; callers fall back to the STRIPE_SECRET_KEY env var for self-hosted-by-Cosmic demos.
export async function getStripeApiKeyForSite(siteId: string) {
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.STRIPE);
  if (!isConnected(credential) || !credential?.encryptedSecretKey) return "";
  return decryptGatewaySecret(credential.encryptedSecretKey);
}

// Every connected site's Stripe webhook signing secret. The webhook route tries each (plus the env
// fallback) so signature verification works without first knowing which site an event belongs to.
export async function getConnectedStripeWebhookSecrets() {
  const credentials = await prisma.paymentGatewayCredential.findMany({
    where: {
      provider: PaymentProvider.STRIPE,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      encryptedWebhookSecret: { not: "" }
    },
    select: { encryptedWebhookSecret: true }
  });
  return credentials.map((credential) => decryptGatewaySecret(credential.encryptedWebhookSecret)).filter(Boolean);
}

// Every connected site's Square webhook signature key, for the same try-each verification approach.
export async function getConnectedSquareWebhookSignatureKeys() {
  const credentials = await prisma.paymentGatewayCredential.findMany({
    where: {
      provider: PaymentProvider.SQUARE,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      encryptedWebhookSecret: { not: "" }
    },
    select: { encryptedWebhookSecret: true }
  });
  return credentials.map((credential) => decryptGatewaySecret(credential.encryptedWebhookSecret)).filter(Boolean);
}

function toPayPalSiteCredentials(credential: {
  encryptedSecretKey: string;
  externalAccountId: string;
  merchantId: string;
  metadata: Prisma.JsonValue;
}): PayPalSiteCredentials | null {
  const clientId = credential.externalAccountId.trim();
  const clientSecret = credential.encryptedSecretKey ? decryptGatewaySecret(credential.encryptedSecretKey) : "";
  if (!clientId || !clientSecret) return null;
  const metadata = credentialMetadata(credential.metadata);

  return {
    clientId,
    clientSecret,
    environment: metadataString(metadata, "environment") === "live" ? "live" : "sandbox",
    merchantId: credential.merchantId.trim(),
    webhookId: metadataString(metadata, "webhookId")
  };
}

// Square access token + environment the merchant pasted for this site.
export async function getSquareAccessToken(siteId: string) {
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.SQUARE);
  if (!credential?.encryptedAccessToken) throw new Error("Connect Square before using Square checkout.");
  const metadata = credentialMetadata(credential.metadata);
  const environment = metadataString(metadata, "environment") === "sandbox" ? "sandbox" : "production";

  return {
    accessToken: decryptGatewaySecret(credential.encryptedAccessToken),
    credential,
    environment: environment as "production" | "sandbox"
  };
}

// PayPal REST app credentials the merchant pasted for this site (first-party direct-charge model).
export async function getPayPalCredentialsForSite(siteId: string) {
  const credential = await getConnectedGatewayCredential(siteId, PaymentProvider.PAYPAL);
  if (!isConnected(credential) || !credential) return null;
  return toPayPalSiteCredentials(credential);
}

// Every connected site's PayPal credentials + webhook id, for try-each webhook verification.
export async function getConnectedPayPalCredentials() {
  const credentials = await prisma.paymentGatewayCredential.findMany({
    where: {
      provider: PaymentProvider.PAYPAL,
      status: PaymentGatewayConnectionStatus.CONNECTED
    }
  });
  return credentials.map((credential) => toPayPalSiteCredentials(credential)).filter((value): value is PayPalSiteCredentials => Boolean(value));
}
