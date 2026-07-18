import crypto from "node:crypto";

// AES-256-GCM helpers for payment gateway secrets at rest. Kept free of the
// "server-only" guard so worker scripts (run with tsx, outside Next) can share
// them — lib/payments/credentials.ts re-exports these for app code.

const algorithm = "aes-256-gcm";
const currentVersion = "v2";
const hkdfSalt = Buffer.from("admitone-showrunner-payment-credentials-v2", "utf8");
const hkdfInfo = Buffer.from("gateway-credential-encryption", "utf8");

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function credentialSecret() {
  const secret = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be set before storing payment gateway credentials.");
  }

  return secret || "local-dev-payment-credential-secret";
}

function legacyEncryptionKey() {
  return crypto.createHash("sha256").update(credentialSecret()).digest();
}

function encryptionKey() {
  return Buffer.from(crypto.hkdfSync("sha256", credentialSecret(), hkdfSalt, hkdfInfo, 32));
}

export function encryptGatewaySecret(value: string) {
  const plaintext = value.trim();
  if (!plaintext) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [currentVersion, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptGatewaySecret(value: string) {
  if (!value) return "";
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (!["v1", currentVersion].includes(version) || !ivText || !tagText || !encryptedText) {
    throw new Error("Payment gateway credential payload is not recognized.");
  }

  const key = version === "v1" ? legacyEncryptionKey() : encryptionKey();
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}
