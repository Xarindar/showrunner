/* eslint-disable @typescript-eslint/no-explicit-any -- Exercise provider setup against isolated accounts and network responses. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness() {
  const saved: any[] = [], deleted: string[] = [], requests: any[] = [];
  let previous: any = null, failSave = false, failWebhook = false, chargesEnabled = true;
  let paypalWebhooks: any[] = [];
  let locations = [{ id: "one", merchant_id: "merchant", status: "ACTIVE", name: "Studio" }];
  const endpoints = new Map<string, any>();
  class StripeError extends Error { statusCode = 404; }
  class Stripe {
    static errors = { StripeError };
    accounts = { retrieveCurrent: async () => ({ id: "acct_client", charges_enabled: chargesEnabled, business_profile: { name: "Client" } }) };
    webhookEndpoints = {
      create: async (input: any) => { if (failWebhook) throw new Error("Permission denied"); const endpoint = { ...input, id: `we_${endpoints.size}`, secret: "whsec_owned", status: "enabled" }; endpoints.set(endpoint.id, endpoint); return endpoint; },
      retrieve: async (id: string) => { if (!endpoints.has(id)) throw new StripeError(); return endpoints.get(id); },
      update: async (id: string, input: any) => Object.assign(endpoints.get(id), input),
      del: async (id: string) => { deleted.push(id); endpoints.delete(id); }
    };
  }
  const realRequire = createRequire(import.meta.url);
  const mocks: Record<string, any> = {
    "server-only": {}, stripe: Stripe,
    "@/lib/env": { publicAppBaseUrl: () => "https://client.example" },
    "@/lib/payments/connect/broker-client": { revokeStripeOAuthProvider: () => { throw new Error("Broker is offline"); } },
    "@/lib/payments/credentials": {
      encryptGatewaySecret: (value: string) => `sealed:${value}`, decryptGatewaySecret: (value: string) => value.replace(/^sealed:/, ""),
      getConnectedGatewayCredential: async () => previous,
      upsertConnectedGatewayCredential: async (input: any) => { if (failSave) throw new Error("Database unavailable"); saved.push(input); }
    },
    "@/lib/prisma": { prisma: {} }
  };
  const fetch = async (url: string, init: any = {}) => {
    requests.push({ url, ...init });
    if (url.includes("square")) return Response.json({ locations });
    if (url.endsWith("/token")) return Response.json({ access_token: "client-only-token" });
    if (init.method === "DELETE") { deleted.push(url); return new Response(null, { status: 204 }); }
    if (init.method === "PATCH") return new Response(null, { status: 204 });
    if (init.method === "POST") return failWebhook ? new Response("{}", { status: 403 }) : Response.json({ id: "owned-webhook" });
    return Response.json({ webhooks: paypalWebhooks });
  };
  function load(path: string): any {
    const exports = {};
    const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    runInNewContext(source, { exports, Buffer, URL, AbortSignal, fetch, process, console,
      require: (id: string) => id in mocks ? mocks[id] : realRequire(id) });
    return exports;
  }
  mocks["./stripe-webhook-setup"] = load("lib/payments/stripe-webhook-setup.ts");
  return { api: load("lib/payments/provider-onboarding.ts"), saved, deleted, endpoints, requests,
    previous: (value: any) => { previous = value; }, failSave: () => { failSave = true; }, failWebhook: () => { failWebhook = true; },
    chargesEnabled: (value: boolean) => { chargesEnabled = value; }, paypalWebhooks: (value: any[]) => { paypalWebhooks = value; },
    locations: (value: typeof locations) => { locations = value; } };
}

test("Stripe provisions its own webhook without Connect and reuses it on same-account key rotation", async () => {
  const h = harness();
  await h.api.saveStripeCredentials({ apiKey: "sk_test_client", siteId: "client", useForCheckout: true });
  assert.equal(h.saved[0].webhookSecret, "whsec_owned");
  assert.equal(h.saved[0].useForCheckout, true);
  assert.equal(h.saved[0].accessToken, "");
  assert.equal(h.saved[0].expiresAt, null);
  assert.equal(h.endpoints.size, 1);
  h.previous({ externalAccountId: "acct_client", encryptedWebhookSecret: "sealed:whsec_owned", metadata: { ...h.saved[0].encryptedMetadata, paymentMethods: { enabled: ["CARD"] } } });
  await h.api.saveStripeCredentials({ apiKey: "sk_test_rotated", siteId: "client" });
  assert.equal(h.endpoints.size, 1);
  assert.equal(h.saved[1].encryptedMetadata.webhookEndpointId, "we_0");
  assert.equal(h.saved[1].encryptedMetadata.paymentMethods.enabled[0], "CARD");
});

test("migrating from Stripe OAuth creates an independent webhook rather than reusing the old app endpoint", async () => {
  const h = harness();
  h.previous({ externalAccountId: "acct_client", encryptedWebhookSecret: "sealed:whsec_shared", metadata: { onboarding: "oauth", keyMode: "test", webhookEndpointId: "shared-app" } });
  await h.api.saveStripeCredentials({ apiKey: "sk_test_client", siteId: "client" });
  assert.equal(h.saved[0].encryptedMetadata.onboarding, "stripe_api_key");
  assert.equal(h.saved[0].encryptedMetadata.webhookEndpointId, "we_0");
});

test("failed webhook setup never replaces credentials; failed persistence removes only the new endpoint", async () => {
  const h = harness(); h.failWebhook();
  await assert.rejects(h.api.saveStripeCredentials({ apiKey: "sk_live_client", siteId: "client" }), /Permission denied/);
  assert.equal(h.saved.length, 0);
  const db = harness(); db.failSave();
  await assert.rejects(db.api.saveStripeCredentials({ apiKey: "sk_test_client", siteId: "client" }), /Database unavailable/);
  assert.deepEqual(db.deleted, ["we_0"]);
});

test("Stripe sandbox setup works before live activation, while live keys require charge capability", async () => {
  const h = harness(); h.chargesEnabled(false);
  await assert.rejects(h.api.saveStripeCredentials({ apiKey: "sk_live_client", siteId: "client" }), /cannot accept charges/);
  assert.equal(h.saved.length, 0);
  await h.api.saveStripeCredentials({ apiKey: "sk_test_client", siteId: "client" });
  assert.equal(h.saved[0].encryptedMetadata.keyMode, "test");
});

test("Square requires an active, explicit location when there are several and clears OAuth state", async () => {
  const h = harness();
  h.locations([{ id: "one", merchant_id: "merchant", status: "ACTIVE", name: "One" }, { id: "two", merchant_id: "merchant", status: "ACTIVE", name: "Two" }]);
  const input = { accessToken: "personal", environment: "sandbox", siteId: "client" };
  await assert.rejects(h.api.saveSquareCredentials(input), /Choose an active/);
  await assert.rejects(h.api.saveSquareCredentials({ ...input, locationId: "somebody-else" }), /not active/);
  assert.equal(h.saved.length, 0);
  await h.api.saveSquareCredentials({ ...input, locationId: "two" });
  assert.equal(h.saved[0].encryptedMetadata.locationId, "two");
  assert.equal(h.saved[0].refreshToken, "");
  assert.equal(h.saved[0].expiresAt, null);
  assert.equal(h.saved[0].webhookSecret, "");
});

test("PayPal registers notifications with the client's app token and never needs a copied webhook ID", async () => {
  const h = harness();
  await h.api.savePayPalCredentials({ clientId: "owned-app", clientSecret: "owned-secret", environment: "sandbox", siteId: "client" });
  const request = h.requests.find((item) => item.method === "POST" && item.url.endsWith("/webhooks"));
  assert.equal(request.headers.Authorization, "Bearer client-only-token");
  assert.equal(JSON.parse(request.body).url, "https://client.example/api/webhooks/paypal");
  assert.equal(h.saved[0].encryptedMetadata.webhookId, "owned-webhook");
  assert.equal(h.saved[0].externalAccountId, "owned-app");
  const failure = harness(); failure.failWebhook();
  await assert.rejects(failure.api.savePayPalCredentials({ clientId: "owned-app", clientSecret: "owned-secret", environment: "live", siteId: "client" }), /could not create/);
  assert.equal(failure.saved.length, 0);
  const db = harness(); db.failSave();
  await assert.rejects(db.api.savePayPalCredentials({ clientId: "app", clientSecret: "secret", environment: "live", siteId: "client" }), /Database unavailable/);
  assert.equal(db.deleted[0], "https://api-m.paypal.com/v1/notifications/webhooks/owned-webhook");
});

test("PayPal repairs a matching webhook's events without duplicating it or removing unrelated subscriptions", async () => {
  const h = harness(); h.paypalWebhooks([{ id: "existing", url: "https://client.example/api/webhooks/paypal", event_types: [{ name: "INVOICING.INVOICE.CREATED" }] }]);
  await h.api.savePayPalCredentials({ clientId: "app", clientSecret: "secret", environment: "sandbox", siteId: "client" });
  const patch = h.requests.find((item) => item.method === "PATCH");
  assert(patch);
  assert.equal(h.requests.filter((item) => item.method === "POST" && item.url.endsWith("/webhooks")).length, 0);
  assert(JSON.parse(patch.body)[0].value.some((item: any) => item.name === "INVOICING.INVOICE.CREATED"));
  assert.equal(h.saved[0].encryptedMetadata.webhookId, "existing");
});

test("disconnected site checkout and payment methods never use a deployment-wide Stripe key", async () => {
  const realRequire = createRequire(import.meta.url);
  const before = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_another_account";
  try {
    for (const path of ["lib/commerce/stripe.ts", "lib/payments/methods.ts"]) {
      const exports: any = {};
      const source = ts.transpileModule(readFileSync(path, "utf8") + "\nexports.getStripeForSite = getStripeForSite;", {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
      }).outputText;
      runInNewContext(source, { exports, process, console, require: (id: string) => {
        if (id === "@/lib/payments/credentials") return { getStripeApiKeyForSite: async () => "" };
        if (id === "stripe") return class { constructor() { throw new Error("A different account was used"); } };
        if (id === "@prisma/client") return realRequire(id);
        return {};
      } });
      await assert.rejects(exports.getStripeForSite("disconnected-site"), /Connect Stripe/);
    }
  } finally {
    if (before === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = before;
  }
});
