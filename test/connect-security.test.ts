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
