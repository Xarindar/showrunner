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
  webhookSecretHint?: string;
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
