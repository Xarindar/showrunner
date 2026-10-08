import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { isSameOriginProofRequest, proofSelectionSchema, proofTokenSchema, readProofRequestBody } from "../modules/portfolio/api/proof-request";
import type { ProofSelectionView } from "../lib/portfolio/purchases";

const origin = "https://gallery.example";
const endpoint = `${origin}/api/portfolio/proofs/private-test-token`;
const expectedTermsVersion = "a".repeat(64);

function request(body: unknown = { itemIds: ["photo-1"] }, headers: Record<string, string> = {}) {
  return new Request(endpoint, { method: "POST", headers: { origin, "content-type": "application/json", "x-proof-request": "1", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify({ expectedTermsVersion, ...(body as object) }) });
}

test("proof finalization requires same-origin JSON capability requests", () => {
  assert.equal(isSameOriginProofRequest(request()), true);
  assert.equal(isSameOriginProofRequest(request({}, { origin: "https://attacker.example" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { origin: "null" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { "x-proof-request": "" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { "sec-fetch-site": "same-site" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { "host": "other.example" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { origin: "https://attacker.example", "x-forwarded-host": "attacker.example" })), false);
  assert.equal(isSameOriginProofRequest(request({}, { origin: `${origin}/path` })), false);
  assert.equal(isSameOriginProofRequest(request({}, { host: "gallery.example/anything" })), false);
});

test("proof origin validation respects the actual Host across Next internal URL reconstruction", () => {
  const request = new Request("http://localhost:3107/api/portfolio/proofs/token", { method: "POST", headers: { origin: "http://127.0.0.1:3107", host: "127.0.0.1:3107", "x-proof-request": "1" } });
  assert.equal(isSameOriginProofRequest(request), true);
  const behindTlsProxy = new Request("http://internal:3000/api/portfolio/proofs/token", { method: "POST", headers: { origin, host: "gallery.example", "x-proof-request": "1", "sec-fetch-site": "same-origin" } });
  assert.equal(isSameOriginProofRequest(behindTlsProxy), true);
});

test("proof request validation accepts only unique bounded image identifiers", () => {
  assert.deepEqual(proofSelectionSchema.parse({ expectedTermsVersion, itemIds: ["photo-1", "photo-2"] }), { expectedTermsVersion, itemIds: ["photo-1", "photo-2"] });
  for (const body of [{}, { itemIds: [] }, { itemIds: ["photo-1", "photo-1"] }, { itemIds: ["photo-1"], totalCents: 0 }, { itemIds: ["photo-1"], paid: true }, { itemIds: [""] }, { itemIds: [3] }, { itemIds: ["x".repeat(129)] }, { itemIds: Array.from({ length: 2001 }, (_, index) => `photo-${index}`) }]) {
    assert.equal(proofSelectionSchema.safeParse({ expectedTermsVersion, ...body }).success, false);
  }
  assert.equal(proofSelectionSchema.safeParse({ itemIds: ["photo-1"] }).success, false);
  assert.equal(proofSelectionSchema.safeParse({ itemIds: ["photo-1"], expectedTermsVersion: "not-a-quote-version" }).success, false);
  assert.equal(proofTokenSchema.safeParse("private-test-token").success, true);
  for (const token of ["", " ", " token ", "t".repeat(257)]) assert.equal(proofTokenSchema.safeParse(token).success, false);
});

test("proof bodies reject unsupported formats and bound both declared and streamed bytes", async () => {
  assert.deepEqual(await readProofRequestBody(request()), { expectedTermsVersion, itemIds: ["photo-1"] });
  await assert.rejects(() => readProofRequestBody(request({}, { "content-type": "application/x-www-form-urlencoded" })), /JSON_REQUIRED/);
  await assert.rejects(() => readProofRequestBody(request({}, { "content-length": "300000" })), /BODY_TOO_LARGE/);
  await assert.rejects(() => readProofRequestBody(request({ itemIds: ["x".repeat(270000)] })), /BODY_TOO_LARGE/);
  await assert.rejects(() => readProofRequestBody(new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), SyntaxError);
});

function mockedModule(path: string, dependencies: Record<string, unknown>) {
  const filename = resolve(path);
  const localRequire = createRequire(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loadedModule = { exports: {} as Record<string, unknown> };
  runInNewContext(output, { module: loadedModule, exports: loadedModule.exports, require: (id: string) => id in dependencies ? dependencies[id] : localRequire(id), URL, Headers, Request, Response, TextDecoder, Uint8Array });
  return loadedModule.exports;
}

class FakeProofError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function api(overrides: Record<string, unknown> = {}) {
  return mockedModule("modules/portfolio/api/proofs.ts", {
    "@/lib/portfolio/purchases": { getProofSelection: async () => null, finalizeProofSelection: async () => ({ purchaseId: "purchase", checkoutUrl: null, status: "RELEASED" }), ProofSelectionError: FakeProofError, ...overrides },
    "@/lib/public-rate-limit": { publicRateLimitMessage: async () => "" },
    "@/lib/site": { getSiteSettings: async () => ({ enabledModuleIds: ["portfolio"] }) }
  }) as { GET: (request: Request, props: { params: Promise<{ token: string }> }) => Promise<Response>; POST: (request: Request, props: { params: Promise<{ token: string }> }) => Promise<Response> };
}

const params = { params: Promise.resolve({ token: "private-test-token" }) };

test("proof API hides invalid access and never caches private results", async () => {
  const response = await api().GET(new Request(endpoint), params);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("proof API rejects spoofed requests and client-priced payloads before finalization", async () => {
  let calls = 0;
  const handlers = api({ finalizeProofSelection: async () => { calls++; return {}; } });
  assert.equal((await handlers.POST(request(undefined, { origin: "https://attacker.example" }), params)).status, 403);
  assert.equal((await handlers.POST(request({ itemIds: ["photo-1"], totalCents: 0 }), params)).status, 400);
  assert.equal((await handlers.POST(request({ itemIds: ["photo-1", "photo-1"] }), params)).status, 400);
  assert.equal(calls, 0);
});

test("proof API passes only the token, terms version and item IDs to the authoritative service", async () => {
  let received: unknown;
  const handlers = api({ finalizeProofSelection: async (input: unknown) => { received = input; return { purchaseId: "purchase", checkoutUrl: null, status: "RELEASED" }; } });
  const response = await handlers.POST(request(), params);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(received)), { token: "private-test-token", expectedTermsVersion, itemIds: ["photo-1"] });
  assert.equal((await response.json()).status, "RELEASED");
});

test("proof API exposes intended service errors but never internal details", async () => {
  const conflict = await api({ finalizeProofSelection: async () => { throw new FakeProofError("Selection already finalized.", 409); } }).POST(request(), params);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, "Selection already finalized.");
  const failure = await api({ getProofSelection: async () => { throw new Error("secret database credential"); } }).GET(new Request(endpoint), params);
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /secret database/);
});

test("private proof and media URLs bypass attribution and send no-referrer", () => {
  const { proxy } = mockedModule("proxy.ts", {}) as { proxy: (request: NextRequest) => Response };
  for (const path of ["/proofs/private-test-token", "/proofs/legacy-token.jpg", "/proofs/payment-return?checkout=success", "/api/portfolio/proofs/private-test-token", "/api/portfolio/galleries/gallery/media/photo?access=private-test-token"]) {
    const response = proxy(new NextRequest(`${origin}${path}`));
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  }
});

const initialView: ProofSelectionView = {
  termsVersion: expectedTermsVersion,
  gallery: { id: "gallery", slug: "shoot", title: "Autumn portrait shoot", description: "Choose your photos." },
  includedCount: 2, extraImagePriceCents: 2500, currency: "USD",
  items: [{ id: "photo-1", title: "Portrait one", altText: "Portrait" }, { id: "photo-2", title: "Portrait two", altText: null }], purchase: null
};

function clientMarkup(view: ProofSelectionView) {
  const button = ({ children, ...props }: Record<string, unknown>) => createElement("button", props, children as string);
  const anchor = ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as string);
  const loaded = mockedModule("modules/portfolio/proof-client.tsx", {
    "./proof-client.module.css": {}, "@/components/ui/button": { Button: button, ButtonAnchor: anchor }, "@/components/ui/modal": { Modal: () => null }
  });
  return renderToStaticMarkup(createElement(loaded.ProofClient as ComponentType<{ initialView: ProofSelectionView; token: string }>, { initialView: view, token: "private-test-token" }));
}

test("proof UI uses watermarked media routes without originals before finalization", () => {
  const html = clientMarkup(initialView);
  assert.match(html, /variant=CARD/);
  assert.match(html, /Watermarked previews/);
  assert.match(html, /\$25\.00/);
  assert.match(html, /Review selection/);
  assert.doesNotMatch(html, /variant=DOWNLOAD|Your selected originals/);
});

test("proof UI locks a pending selection and withholds even supplied download URLs", () => {
  const html = clientMarkup({ ...initialView, purchase: { id: "purchase", status: "PENDING", canRetryCheckout: true, selectedItemIds: ["photo-1"], includedCount: 2, extraCount: 0, extraImagePriceCents: 2500, totalCents: 0, currency: "USD", checkoutUrl: null, downloads: [{ itemId: "photo-1", filename: "portrait.jpg", url: "/original-private" }] } });
  assert.match(html, /Awaiting payment/);
  assert.match(html, /Resume or renew checkout/);
  assert.doesNotMatch(html, /original-private|Review selection/);
  assert.match(html, /disabled=""/);
});

test("released UI shows only entitlement downloads for the immutable selected IDs", () => {
  const html = clientMarkup({ ...initialView, purchase: { id: "purchase", status: "RELEASED", canRetryCheckout: false, selectedItemIds: ["photo-1"], includedCount: 2, extraCount: 0, extraImagePriceCents: 2500, totalCents: 0, currency: "USD", checkoutUrl: null, downloads: [{ itemId: "photo-1", filename: "portrait.jpg", url: "/selected-original" }, { itemId: "photo-2", filename: "other.jpg", url: "/unselected-original" }] } });
  assert.match(html, /Your selected originals/);
  assert.match(html, /selected-original/);
  assert.doesNotMatch(html, /unselected-original/);
});

test("checkout recovery requires server permission and an eligible immutable purchase state", () => {
  const purchase = { id: "purchase", selectedItemIds: ["photo-1"], includedCount: 0, extraCount: 1, extraImagePriceCents: 2500, totalCents: 2500, currency: "USD", checkoutUrl: "https://provider.example/stale-checkout", downloads: [] };
  for (const status of ["PENDING", "FAILED", "BLOCKED"]) {
    const retryable = clientMarkup({ ...initialView, purchase: { ...purchase, status, canRetryCheckout: true } });
    assert.match(retryable, /Resume or renew checkout/);
    assert.doesNotMatch(retryable, /href="https:\/\/provider\.example\/stale-checkout"/);
    const blocked = clientMarkup({ ...initialView, purchase: { ...purchase, status, canRetryCheckout: false } });
    assert.doesNotMatch(blocked, /Resume or renew checkout|Review selection/);
  }
  for (const status of ["RELEASED", "REFUNDED", "UNKNOWN"]) {
    const blocked = clientMarkup({ ...initialView, purchase: { ...purchase, status, canRetryCheckout: true } });
    assert.doesNotMatch(blocked, /Resume or renew checkout|Review selection/);
  }
});
