/* eslint-disable @typescript-eslint/no-explicit-any -- Provider and persistence mocks exercise rollback without merchant mutations. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness(existing: boolean, failSave: boolean, squareLocations = [{ id: "location", name: "Main", status: "ACTIVE" }]) {
  const effects: string[] = [];
  class Stripe {
    static errors = { StripeError: class extends Error {} };
    accounts = { retrieveCurrent: async () => ({ charges_enabled: true, id: "acct_same" }) };
    webhookEndpoints = {
      retrieve: async () => ({ id: "old", url: "https://client.example/api/webhooks/stripe", status: "enabled" }),
      create: async () => { effects.push("create"); return { id: "new", secret: "whsec_new" }; },
      del: async (id: string) => { effects.push(`delete:${id}`); }
    };
  }
  const mocks: Record<string, unknown> = {
    stripe: Stripe,
    "server-only": {},
    "@/lib/env": { publicAppBaseUrl: () => "https://client.example" },
    "@/lib/prisma": { prisma: { paymentGatewayCredential: { upsert: async ({ update }: any) => { effects.push(`square:${update.status}`); }, findUnique: async () => existing
      ? { externalAccountId: "acct_same", encryptedWebhookSecret: "saved", metadata: { webhookEndpointId: "old" } }
      : null } } },
    "@/lib/payments/credentials": {
      decryptGatewaySecret: () => "whsec_saved",
      encryptGatewaySecret: (value: string) => `sealed:${value}`,
      upsertConnectedGatewayCredential: async (value: any) => {
        effects.push("save");
        if (failSave) throw new Error("database unavailable");
        assert.equal(value.webhookSecret, existing ? "whsec_saved" : "whsec_new");
      }
    },
    "@/lib/payments/provider-onboarding": { secretHint: () => "hint", squareVerify: async () => squareLocations },
    "./broker-client": { revokeStripeOAuthProvider: async () => { effects.push("revoke"); } },
    "./config": {}, "./square-refresh": { exchangeSquarePkceCode: async () => ({ accessToken: "square-access", refreshToken: "square-refresh", merchantId: "merchant", expiresAt: new Date(), refreshTokenExpiresAt: new Date() }) }, "./tokens": {}
  };
  const source = ts.transpileModule(readFileSync("lib/payments/connect/flow.ts", "utf8") + "\nexports.completeStripeHandoff = completeStripeHandoff; exports.completeSquareHandoff = completeSquareHandoff;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const exports: any = {};
  const realRequire = createRequire(import.meta.url);
  runInNewContext(source, { exports, console, Date, Error, URL, Buffer, process, require: (id: string) => id in mocks ? mocks[id] : realRequire(id) });
  return { effects, run: () => exports.completeStripeHandoff("site", { accessToken: "test", stripeUserId: "acct_same", scope: "read_write", livemode: false }),
    square: () => exports.completeSquareHandoff("site", { authorizationCode: "code", clientId: "app", redirectUri: "https://connect.example/callback", squareVersion: "2026-05-20" }, "verifier") };
}

test("failed Stripe reconnect preserves the existing endpoint and authorization", async () => {
  const h = harness(true, true);
  await assert.rejects(h.run(), /database unavailable/);
  assert.deepEqual(h.effects, ["save"]);
});

test("successful Stripe reconnect reuses its saved signing secret without creating duplicates", async () => {
  const h = harness(true, false);
  await h.run();
  assert.deepEqual(h.effects, ["save"]);
});

test("failed first-time Stripe setup removes only its new webhook and authorization", async () => {
  const h = harness(false, true);
  await assert.rejects(h.run(), /database unavailable/);
  assert.deepEqual(h.effects, ["create", "save", "delete:new", "revoke"]);
});

test("Square finishes a single-location connection without webhook keys or another step", async () => {
  const h = harness(false, false);
  const result = await h.square();
  assert.equal(result.pendingLocationSelection, false);
  assert.equal(result.displayName, "Main");
  assert.deepEqual(h.effects, ["square:CONNECTED"]);
});

test("Square requires a choice when the seller has multiple active locations", async () => {
  const h = harness(false, false, [{ id: "one", name: "One", status: "ACTIVE" }, { id: "two", name: "Two", status: "ACTIVE" }]);
  assert.equal((await h.square()).pendingLocationSelection, true);
  assert.deepEqual(h.effects, ["square:PENDING"]);
});
