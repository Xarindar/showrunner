import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { PaymentGatewayConnectionStatus } from "@prisma/client";
import {
  base64urlEncode,
  ConnectTokenError,
  signConnectToken,
  signServiceRequest,
  verifyConnectToken
} from "../lib/payments/connect/tokens";
import { brokerRequest } from "../lib/payments/connect/broker-client";
import { decryptGatewaySecret, encryptGatewaySecret } from "../lib/payments/credential-crypto";
import {
  createSquarePkcePair,
  exchangeSquarePkceCode,
  isSquareCredentialUsable,
  isSquareRefreshTokenRejected,
  refreshSquarePkceToken,
  squareRefreshRequiresReconnect
} from "../lib/payments/connect/square-refresh";

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
  const signature = signServiceRequest("POST", "/connect/stripe/revoke", body, envelope, secret);
  assert.match(signature, /^v1=[A-Za-z0-9_-]{43}$/);
  assert.notEqual(signature, signServiceRequest("POST", "/connect/handoff/redeem", body, envelope, secret));
  assert.notEqual(signature, signServiceRequest("POST", "/connect/stripe/revoke", `${body} `, envelope, secret));

  const bodyDigest = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = [
    "admitone-service-request-v1",
    "POST",
    "/connect/stripe/revoke",
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

test("Square PKCE exchange and refresh happen directly without an application secret", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      requests.push({ body, url });
      return new Response(JSON.stringify({
        access_token: `access-${requests.length}`,
        expires_at: "2026-08-18T00:00:00Z",
        merchant_id: "merchant-1",
        refresh_token: `refresh-${requests.length}`,
        refresh_token_expires_at: "2026-10-16T00:00:00Z"
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const pair = createSquarePkcePair();
    assert.match(pair.verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(
      pair.challenge,
      crypto.createHash("sha256").update(pair.verifier, "ascii").digest("base64url")
    );

    await exchangeSquarePkceCode({
      authorizationCode: "short-lived-code",
      clientId: "sandbox-sq0idb-public",
      codeVerifier: pair.verifier,
      environment: "sandbox",
      redirectUri: "https://connect.example.com/connect/square/callback",
      squareVersion: "2026-05-20"
    });
    await refreshSquarePkceToken({
      clientId: "sandbox-sq0idb-public",
      environment: "sandbox",
      refreshToken: "rotating-refresh-token",
      squareVersion: "2026-05-20"
    });

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "https://connect.squareupsandbox.com/oauth2/token");
    assert.deepEqual(requests[0]?.body, {
      client_id: "sandbox-sq0idb-public",
      code: "short-lived-code",
      code_verifier: pair.verifier,
      grant_type: "authorization_code",
      redirect_uri: "https://connect.example.com/connect/square/callback"
    });
    assert.deepEqual(requests[1]?.body, {
      client_id: "sandbox-sq0idb-public",
      grant_type: "refresh_token",
      refresh_token: "rotating-refresh-token"
    });
    assert.equal(requests.some((request) => "client_secret" in request.body), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Square refresh token rejection is distinguishable from transient provider failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      errors: [{
        category: "AUTHENTICATION_ERROR",
        code: "UNAUTHORIZED",
        detail: "The refresh token is invalid or has already been used."
      }]
    }), { status: 401, headers: { "content-type": "application/json" } });

    await assert.rejects(
      refreshSquarePkceToken({
        clientId: "sandbox-sq0idb-public",
        environment: "sandbox",
        refreshToken: "consumed-refresh-token"
      }),
      (error) => {
        assert.equal(isSquareRefreshTokenRejected(error), true);
        assert.doesNotMatch(error instanceof Error ? error.message : String(error), /consumed-refresh-token/);
        return true;
      }
    );

    globalThis.fetch = async () => new Response(JSON.stringify({
      errors: [{ category: "API_ERROR", code: "INTERNAL_SERVER_ERROR", detail: "Try again later." }]
    }), { status: 500, headers: { "content-type": "application/json" } });

    await assert.rejects(
      refreshSquarePkceToken({
        clientId: "sandbox-sq0idb-public",
        environment: "sandbox",
        refreshToken: "still-valid-refresh-token"
      }),
      (error) => {
        assert.equal(isSquareRefreshTokenRejected(error), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Square keeps an unexpired access token usable while requiring refresh reconnection", () => {
  const reconnectCredential = {
    encryptedAccessToken: "encrypted-access-token",
    expiresAt: new Date(Date.now() + 60_000),
    metadata: { squareRefreshFailure: "refresh_token_rejected" },
    status: PaymentGatewayConnectionStatus.ERROR
  };

  assert.equal(squareRefreshRequiresReconnect(reconnectCredential), true);
  assert.equal(isSquareCredentialUsable(reconnectCredential), true);
  assert.equal(isSquareCredentialUsable({
    ...reconnectCredential,
    expiresAt: new Date(Date.now() - 1)
  }), false);
  assert.equal(isSquareCredentialUsable({
    ...reconnectCredential,
    metadata: {},
    status: PaymentGatewayConnectionStatus.CONNECTED
  }), true);
});

test("payment runtime has no Connect broker dependency and Stripe OAuth is stored once", () => {
  const runtimeFiles = [
    "lib/commerce/stripe.ts",
    "lib/commerce/square.ts",
    "lib/payments/credentials.ts",
    "lib/payments/methods.ts",
    "lib/payments/connect/square-refresh.ts"
  ];
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /payments\/connect\/broker-client/);
    assert.doesNotMatch(source, /\bbrokerRequest\s*\(/);
  }

  const handoffSource = fs.readFileSync("lib/payments/connect/flow.ts", "utf8");
  assert.doesNotMatch(handoffSource, /secretKey:\s*accessToken/);
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
