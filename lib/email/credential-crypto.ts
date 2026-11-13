import crypto from "node:crypto";

function encryptionKey() {
  const secret = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (secret.length < 32 || /replace-with|local-dev|change-me/i.test(secret)) {
    throw new Error("This deployment needs a strong AUTH_SECRET or EMAIL_CREDENTIAL_ENCRYPTION_KEY before email credentials can be saved.");
  }
  return Buffer.from(crypto.hkdfSync("sha256", secret, "showrunner-email-v1", "provider-email-credentials", 32));
}

export function encryptEmailSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptEmailSecret(value: string) {
  const [version, iv, tag, ciphertext, extra] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra !== undefined) throw new Error("Invalid email credential.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
