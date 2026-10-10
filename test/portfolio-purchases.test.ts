/* eslint-disable @typescript-eslint/no-explicit-any -- VM boundary mocks exercise heterogeneous server-service calls. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as policy from "../lib/portfolio/selection-policy";

function fixture() {
  const asset = { id: "asset-a", siteId: "site-a", isPrivate: true, deletedAt: null, driver: "S3", filename: "a.jpg" };
  const item = { id: "item-a", galleryId: "gallery-a", mediaAssetId: asset.id, isDownloadable: true, type: "IMAGE", mediaAsset: asset, title: "A", altText: "A" };
  const purchase = { id: "purchase-a", galleryId: "gallery-a", siteId: "site-a", clientId: "client-a", allowance: 1, extraPriceCents: 900, extraCount: 0, totalCents: 0, currency: "USD", order: null, orderId: null, revokedAt: null as Date | null, selections: [{ itemId: item.id, mediaAssetId: asset.id, mediaAsset: asset, item }] };
  const gallery = { id: "gallery-a", siteId: "site-a", clientId: "client-a", proofingEnabled: true, downloadEnabled: true, selectionAllowance: 1, extraPhotoPriceCents: 900, selectionCurrency: "USD", packageProductId: "product-a", packageProduct: { siteId: "site-a", type: "SERVICE_PACKAGE", name: "Package" }, purchasedOrder: { siteId: "site-a", clientId: "client-a", status: "PAID", items: [{ productId: "product-a" }] }, items: [item], purchase: purchase as typeof purchase | null };
  return { access: { id: "access-a", accessToken: "token-a", clientId: "client-a", galleryId: gallery.id, gallery }, asset, item, purchase, gallery };
}
function load(db: unknown) {
  const file = "lib/portfolio/purchases.ts";
  const output = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (...args: any[]) => Promise<any>> = {}; // Mock boundary intentionally accepts multiple exported service signatures.
  const require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a", enabledModuleIds: ["portfolio"] }) }, "@/lib/payments/checkout": { createPaymentCheckoutSessionForOrder: async () => { throw new Error("No real provider calls in tests"); } }, "@/lib/payments/registry": { resolvePaymentProviderForSite: async () => "STRIPE" }, "./checkout-recovery": { recoverGalleryCheckout: async () => { throw new Error("No real checkout calls"); }, GalleryCheckoutRecoveryError: class extends Error {} }, "./selection-policy": policy };
  runInNewContext(output, { exports, console, Date, URL, encodeURIComponent, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const expectedTermsVersion = createHash("sha256").update(JSON.stringify([1, 900, "USD", "product-a", undefined])).digest("hex");
const request = { siteId: "site-a", galleryId: "gallery-a", itemId: "item-a", accessId: "access-a" };
test("original authorization enforces client, gallery, immutable asset, tenant, controls and revoked payment", async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => { f.access.clientId = "client-other"; },
    (f: ReturnType<typeof fixture>) => { f.purchase.revokedAt = new Date(); },
    (f: ReturnType<typeof fixture>) => { f.purchase.clientId = "client-other"; },
    (f: ReturnType<typeof fixture>) => { f.item.galleryId = "gallery-other"; },
    (f: ReturnType<typeof fixture>) => { f.item.mediaAssetId = "substituted-original"; },
    (f: ReturnType<typeof fixture>) => { f.asset.siteId = "site-other"; },
    (f: ReturnType<typeof fixture>) => { f.asset.isPrivate = false; },
    (f: ReturnType<typeof fixture>) => { f.item.isDownloadable = false; },
    (f: ReturnType<typeof fixture>) => { f.gallery.downloadEnabled = false; },
    (f: ReturnType<typeof fixture>) => { f.gallery.purchasedOrder.status = "REFUNDED"; }
  ];
  for (const change of [null, ...cases]) {
    const f = fixture(); change?.(f);
    const db = { portfolioGalleryAccess: { findFirst: async () => f.access } };
    assert.equal(await load(db).authorizeGalleryOriginal(request), change === null);
  }
  const f = fixture();
  assert.equal(await load({ portfolioGalleryAccess: { findFirst: async () => f.access } }).authorizeGalleryOriginal({ ...request, itemId: "not-selected" }), false);
});
test("expired/revoked access fails closed and query rechecks expiration and current tenant", async () => {
  const queries: any[] = [];
  const loaded = load({ portfolioGalleryAccess: { findFirst: async (q: unknown) => { queries.push(q); return null; } } });
  assert.equal(await loaded.authorizeGalleryOriginal(request), false);
  assert.equal(queries[0].where.siteId, "site-a");
  assert.equal(queries[0].where.status, "ACTIVE");
  assert.ok(queries[0].where.OR[1].expiresAt.gt instanceof Date);
});
test("finalization snapshots server package values and serializes duplicate/concurrent requests", async () => {
  const f = fixture(); f.gallery.purchase = null;
  let createCount = 0;
  let queue = Promise.resolve();
  const db: any = {
    portfolioGalleryAccess: { findFirst: async () => f.access },
    $queryRaw: async () => [],
    client: { findFirst: async () => ({ id: "client-a", name: "Synthetic client", email: "fixture@example.invalid" }) },
    portfolioSelectionPurchase: { create: async ({ data }: any) => {
      createCount++;
      assert.equal(data.allowance, 1); assert.equal(data.extraPriceCents, 900); assert.equal(data.currency, "USD"); assert.equal(data.totalCents, 0); assert.equal(data.selectedCount, 1);
      f.gallery.purchase = { ...f.purchase, ...data, selections: f.purchase.selections, orderId: null };
      return f.gallery.purchase;
    } }
  };
  db.$transaction = (fn: (tx: unknown) => Promise<unknown>) => { const run = queue.then(() => fn(db)); queue = run.then(() => undefined, () => undefined); return run; };
  const loaded = load(db);
  const result = await Promise.all([loaded.finalizeProofSelection({ token: "token-a", expectedTermsVersion, itemIds: ["item-a"], totalCents: 1 }), loaded.finalizeProofSelection({ token: "token-a", expectedTermsVersion, itemIds: ["item-a"] })]);
  assert.equal(createCount, 1);
  assert.ok(result.every(r => r.status === "RELEASED"));
  await assert.rejects(loaded.finalizeProofSelection({ token: "token-a", expectedTermsVersion, itemIds: ["other"] }), /already has a finalized/);
});
test("tampered and duplicate photo IDs cannot create a purchase", async () => {
  const f = fixture(); f.gallery.purchase = null;
  const db: any = { portfolioGalleryAccess: { findFirst: async () => f.access }, $queryRaw: async () => [] };
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  const loaded = load(db);
  await assert.rejects(loaded.finalizeProofSelection({ token: "token-a", expectedTermsVersion: "stale", itemIds: ["item-a"] }), /terms changed/);
  await assert.rejects(loaded.finalizeProofSelection({ token: "token-a", expectedTermsVersion, itemIds: ["foreign-photo"] }), /unavailable/);
  await assert.rejects(loaded.finalizeProofSelection({ token: "token-a", expectedTermsVersion, itemIds: ["item-a", "item-a"] }), /valid set/);
});

test("monotonic revocation beats a delayed verified paid callback", async () => {
  const f = fixture();
  const paidOrder = { siteId: "site-a", clientId: "client-a", status: "PAID", totalCents: 900, currency: "USD", payments: [{ provider: "STRIPE", status: "PAID", amountCents: 900, currency: "USD", refundedCents: 0, providerVerifiedAt: new Date(), externalPaymentId: "pi_fixture" }] };
  Object.assign(f.purchase, { totalCents: 900, extraCount: 1, order: paidOrder, orderId: "extra-order" });
  const loaded = load({ portfolioGalleryAccess: { findFirst: async () => f.access } });
  assert.equal(await loaded.authorizeGalleryOriginal(request), true);
  f.purchase.revokedAt = new Date();
  assert.equal(await loaded.authorizeGalleryOriginal(request), false);
});

test("existing purchase cannot be resumed by a reassigned or mismatched gallery client", async () => {
  const f = fixture(); f.purchase.clientId = "other-client";
  const db: any = { portfolioGalleryAccess: { findFirst: async () => f.access }, $queryRaw: async () => [] };
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  await assert.rejects(load(db).finalizeProofSelection({ token: "token-a", expectedTermsVersion, itemIds: ["item-a"] }), /unavailable for this client/);
});

test("client shoots stay separate from public Portfolio embeds, even with a token", async () => {
  const file = "lib/embed/public-galleries.ts";
  const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const queries: any[] = [];
  const exports: any = {};
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/embed/gateway": { EmbedRequestError: class extends Error {} }, "@/lib/portfolio/access": {}, "@/lib/prisma": { prisma: { portfolioGallery: { findMany: async (q: any) => { queries.push(q); return []; }, findFirst: async () => ({ clientId: "client-a" }) } } } };
  const require = createRequire(import.meta.url);
  runInNewContext(output, { exports, URLSearchParams, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  await exports.listPublicGalleries("site-a");
  assert.equal(queries[0].where.clientId, null);
  await assert.rejects(exports.getPublicGallery({ siteId: "site-a", slug: "shoot", accessToken: "valid-token" }), /Gallery not found/);
});
