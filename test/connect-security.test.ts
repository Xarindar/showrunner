import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  base64urlEncode,
  ConnectTokenError,
  signConnectToken,
  signServiceRequest,
  verifyConnectToken
} from "../lib/payments/connect/tokens";
import { brokerRequest } from "../lib/payments/connect/broker-client";
import { decryptGatewaySecret, encryptGatewaySecret } from "../lib/payments/credential-crypto";

const secret = "test-shared-secret-with-sufficient-entropy";

test("connect state tokens enforce type, signature, and expiry", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signConnectToken({ typ: "admitone.client_state", v: 1, iat: now, exp: now + 60 }, secret);
  assert.equal(
    verifyConnectToken<{ typ: string }>(token, secret, "admitone.client_state").typ,
    "admitone.client_state"
  );
  assert.throws(() => verifyConnectToken(token, secret, "admitone.handoff"), ConnectTokenError);
  assert.throws(() => verifyConnectToken(`${token.slice(0, -1)}x`, secret, "admitone.client_state"), ConnectTokenError);

  const expired = signConnectToken({ typ: "admitone.client_state", v: 1, iat: now - 120, exp: now - 60 }, secret);
  assert.throws(() => verifyConnectToken(expired, secret, "admitone.client_state"), ConnectTokenError);
});

test("service signatures bind method, path, tenant envelope, time, nonce, and body", () => {
  const envelope = {
    client_id: "client-1",
    site_id: "site-1",
    provider: "square",
    iat: 1_800_000_000,
    exp: 1_800_000_300,
    request_id: "abcdefghijklmnopqrstuvwxyz123456"
  };
  const body = JSON.stringify({ ...envelope, refreshToken: "opaque-handle" });
  const signature = signServiceRequest("POST", "/connect/square/refresh", body, envelope, secret);
  assert.match(signature, /^v1=[A-Za-z0-9_-]{43}$/);
  assert.notEqual(signature, signServiceRequest("POST", "/connect/handoff/redeem", body, envelope, secret));
  assert.notEqual(signature, signServiceRequest("POST", "/connect/square/refresh", `${body} `, envelope, secret));

  const bodyDigest = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = [
    "admitone-service-request-v1",
    "POST",
    "/connect/square/refresh",
    envelope.client_id,
    envelope.site_id,
    envelope.provider,
    String(envelope.iat),
    String(envelope.exp),
    envelope.request_id,
    bodyDigest
  ].join("\n");
  const independent = `v1=${base64urlEncode(crypto.createHmac("sha256", secret).update(canonical, "utf8").digest())}`;
  assert.equal(signature, independent);
});

test("payment credentials use a dedicated HKDF key while retaining v1 decrypt compatibility", () => {
  const previous = {
    authSecret: process.env.AUTH_SECRET,
    credentialSecret: process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY,
    nodeEnv: process.env.NODE_ENV
  };
  const credentialSecret = "dedicated-payment-credential-key-with-enough-entropy";

  try {
    Reflect.set(process.env, "NODE_ENV", "test");
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = credentialSecret;
    process.env.AUTH_SECRET = "different-auth-secret-with-enough-entropy";

    const encrypted = encryptGatewaySecret("merchant-secret");
    assert.match(encrypted, /^v2:/);
    assert.equal(decryptGatewaySecret(encrypted), "merchant-secret");
    assert.equal(decryptGatewaySecret(legacyEncryptedValue("legacy-secret", credentialSecret)), "legacy-secret");

    Reflect.set(process.env, "NODE_ENV", "production");
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    assert.throws(
      () => encryptGatewaySecret("must-not-use-auth-secret"),
      /PAYMENT_CREDENTIAL_ENCRYPTION_KEY/
    );
  } finally {
    restoreEnv("AUTH_SECRET", previous.authSecret);
    restoreEnv("PAYMENT_CREDENTIAL_ENCRYPTION_KEY", previous.credentialSecret);
    restoreEnv("NODE_ENV", previous.nodeEnv);
  }
});

test("broker requests use at least 256 bits of request-id entropy", async () => {
  const previous = {
    baseUrl: process.env.ADMITONE_CONNECT_BASE_URL,
    clientId: process.env.ADMITONE_CONNECT_CLIENT_ID,
    sharedSecret: process.env.ADMITONE_CONNECT_SHARED_SECRET
  };
  const originalFetch = globalThis.fetch;
  let requestId = "";

  try {
    process.env.ADMITONE_CONNECT_BASE_URL = "https://connect.example.com";
    process.env.ADMITONE_CONNECT_CLIENT_ID = "client-1";
    process.env.ADMITONE_CONNECT_SHARED_SECRET = secret;
    globalThis.fetch = async (_input, init) => {
      requestId = String((JSON.parse(String(init?.body)) as { request_id?: string }).request_id || "");
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    await brokerRequest({
      path: "/connect/stripe/revoke",
      provider: "stripe",
      siteId: "site-1",
      fields: { externalAccountId: "acct_test" }
    });
    assert.match(requestId, /^[A-Za-z0-9_-]{43}$/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("ADMITONE_CONNECT_BASE_URL", previous.baseUrl);
    restoreEnv("ADMITONE_CONNECT_CLIENT_ID", previous.clientId);
    restoreEnv("ADMITONE_CONNECT_SHARED_SECRET", previous.sharedSecret);
  }
});

function legacyEncryptedValue(value: string, secretValue: string) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secretValue).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
