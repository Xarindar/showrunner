import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blockRegistry, emptyFields } from "../modules/content/studio/registry";
import { imageFirst } from "../modules/content/studio/field-layout";
import type { ZodType } from "zod";
import { resolveShowcase, type CatalogCard } from "../modules/content/studio/showcase";
import { blockDependenciesAvailable, configuredBlock, validateManifest, type ContentManifest } from "../modules/content/studio/manifest";
import { payloadSchema } from "../modules/content/studio/registry";
import { readStudio, resolveStudioPayload, validateBlockUpdate } from "../modules/content/studio/state";
import { catalogMediaUrl } from "../lib/catalog-media-url";

const manifest: ContentManifest = { version: 1, id: "test", pages: [{ id: "home", path: "/", label: "Home" }], blocks: [], booking: { path: "/booking.html", profilesByCategory: { hive: "the-hive" } } };
const service: CatalogCard = { key: "service:s1", id: "s1", kind: "service", slug: "head-spa", name: "Head spa", description: "Relax", imageUrl: "https://site.example/spa.webp", priceCents: null, currency: "", durationMinutes: 45, available: true, category: "hive" };
const product: CatalogCard = { ...service, key: "product:p1", id: "p1", kind: "product", slug: "care-kit", name: "Care kit", priceCents: 2500, currency: "USD", durationMinutes: null };
const rows = [service, product].map(item => ({ id: `card-${item.id}`, catalogKey: item.key, variant: "", displayOnly: false }));

test("showcase bindings resolve current records and expose only public fields", () => {
  const cards = resolveShowcase(rows, [service, { ...product, privateNotes: "secret" } as CatalogCard], manifest);
  assert.equal(cards[0].ctaHref, "/booking.html?service=head-spa&next=1&profile=the-hive");
  assert.equal(cards[1].ctaHref, "", "no invented storefront destination");
  assert.equal(cards[1].priceCents, 2500);
  assert.equal("privateNotes" in cards[1], false);
  assert.equal("category" in cards[0], false);
  const updated = resolveShowcase(rows, [{ ...service, name: "Updated service", durationMinutes: 60 }], manifest);
  assert.equal(updated[0].name, "Updated service");
  assert.equal(updated[0].durationMinutes, 60);
  assert.equal(updated.length, 1, "deleted or inactive records are omitted");
  assert.deepEqual(resolveShowcase(rows, [], manifest), []);
});

test("display-only, inventory and trusted product destinations govern actions", () => {
  assert.equal(resolveShowcase([{ ...rows[0], displayOnly: true }], [service], manifest)[0].ctaHref, "");
  const store = { ...manifest, products: { path: "/shop.html", slugParameter: "product" } };
  assert.equal(resolveShowcase(rows, [product], store)[0].ctaHref, "/shop.html?product=care-kit");
  assert.equal(resolveShowcase(rows, [product], { ...store, products: { path: "/shop.html?collection=care#details", slugParameter: "product" } })[0].ctaHref, "/shop.html?collection=care&product=care-kit#details");
  const unavailable = resolveShowcase(rows, [{ ...product, available: false }], store)[0];
  assert.equal(unavailable.name, product.name);
  assert.equal(unavailable.ctaHref, "");
  assert.equal(unavailable.available, false);
  assert.throws(() => validateManifest({ ...manifest, products: { path: "javascript:alert(1)", slugParameter: "product" } }), /destination/);
});

test("schema rejects copy overrides, invalid references, duplicate and unapproved styles", () => {
  const payload = { heading: "Our menu", items: rows };
  assert.equal(payloadSchema("showcase").safeParse(payload).success, true);
  for (const item of [{ ...rows[0], title: "Competing title" }, { ...rows[0], priceCents: 1 }, { ...rows[0], catalogKey: "unknown:s1" }]) {
    assert.equal(payloadSchema("showcase").safeParse({ ...payload, items: [item] }).success, false);
  }
  const block = configuredBlock("menu", "showcase", ["home"], { cardVariants: [{ label: "Compact", value: "compact" }] });
  const request = { id: block.id, revision: 0, pageIds: ["home"], payload };
  assert.throws(() => validateBlockUpdate(block, undefined, { ...request, payload: { ...payload, items: [rows[0], { ...rows[0], id: "second" }] } }), /only once/);
  assert.throws(() => validateBlockUpdate(block, undefined, { ...request, payload: { ...payload, items: [{ ...rows[0], variant: "arbitrary" }] } }), /style/);
  assert.doesNotThrow(() => validateBlockUpdate(block, undefined, { ...request, payload: { ...payload, items: [{ ...rows[0], variant: "compact" }] } }));
});

function loadMocked(file: string, mocks: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  const require = createRequire(import.meta.url);
  runInNewContext(output, { exports, console, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return exports;
}

test("catalog queries are tenant/module scoped and never emit private or deleted artwork", async () => {
  const queries: Record<string, unknown>[] = [];
  const db = { service: { findMany: async (query: Record<string, unknown>) => { queries.push(query); return [{ ...service, mediaAsset: { isPrivate: true, siteId: "site-a" } }]; } }, product: { findMany: async (query: Record<string, unknown>) => { queries.push(query); return [{ ...product, basePriceCents: 2500, trackInventory: true, inventoryQuantity: 0, media: [{ mediaAsset: { isPrivate: false, deletedAt: new Date(), siteId: "site-a" } }] }]; } } };
  const loaded = loadMocked("modules/content/studio/showcase-catalog.ts", { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/media": { mediaAssetDisplayUrl: () => "private-signed-url" } });
  const catalog = await loaded.showcaseCatalog("site-a", ["scheduling", "products"]) as CatalogCard[];
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].imageUrl, "");
  assert.equal(catalog[1].imageUrl, "");
  assert.equal(catalog[1].available, false);
  assert.equal((queries[0].where as Record<string, unknown>).siteId, "site-a");
  assert.equal((queries[0].where as Record<string, unknown>).isActive, true);
  assert.equal((queries[1].where as Record<string, unknown>).status, "ACTIVE");
  queries.length = 0;
  assert.equal((await loaded.showcaseCatalog("site-a", []) as unknown[]).length, 0);
  assert.equal(queries.length, 0);
  db.service.findMany = async () => [{ ...service, mediaAsset: { isPrivate: false, siteId: "site-b" } }];
  const foreign = await loaded.showcaseCatalog("site-a", ["scheduling"]) as CatalogCard[];
  assert.equal(foreign[0].imageUrl, "", "foreign-tenant media associations must never cross the public boundary");
});

test("legacy catalog images resolve on the website while admin media stays on Showrunner", () => {
  assert.equal(catalogMediaUrl("assets/hive/spa.webp", "https://site.example/index.html"), "https://site.example/assets/hive/spa.webp");
  assert.equal(catalogMediaUrl("/assets/hive/spa.webp", "https://site.example"), "https://site.example/assets/hive/spa.webp");
  assert.equal(catalogMediaUrl("/api/media/assets/image/card", "https://site.example"), "/api/media/assets/image/card");
  assert.equal(catalogMediaUrl("https://media.example/image.webp", "https://site.example"), "https://media.example/image.webp");
});


test("separate notes forms preserve omitted fields and rescheduling requires a disclosed choice", () => {
  const validation = loadMocked("lib/admin-validation.ts", {
    "server-only": {}, "next/headers": {}, "next/navigation": {},
    "@/lib/form-data": {}, "@/lib/format": { timeToMinutes: () => 0 },
    "@/lib/clients/status": { clientStatusValues: ["active_order"], defaultClientStatus: "active_order" },
    "@/lib/security/urls": {}, "@/lib/theme/tokens": {},
  });
  const notes = validation.bookingDetailFormSchema as unknown as ZodType;
  const parsed = notes.parse({ id: "booking", adminNotes: "Staff only" }) as Record<string, unknown>;
  assert.equal(parsed.adminNotes, "Staff only");
  assert.equal("cancellationReason" in parsed, false);
  const reason = notes.parse({ id: "booking", cancellationReason: "Weather" }) as Record<string, unknown>;
  assert.equal("adminNotes" in reason, false);
  const reschedule = validation.bookingRescheduleFormSchema as unknown as ZodType;
  for (const [notifyCustomer, expected] of [["on", true], ["off", false], [undefined, false]]) {
    assert.equal((reschedule.parse({ id: "booking", startsAt: "2026-10-20T10:00", ...(notifyCustomer ? { notifyCustomer } : {}) }) as Record<string, unknown>).notifyCustomer, expected);
  }
});

test("reschedule notifications use the explicit-false gate without sending real mail", async () => {
  const calls: unknown[][] = [];
  let queries = 0;
  const booking = { id: "booking", startsAt: new Date("2026-10-20T10:00:00Z") };
  const loaded = loadMocked("modules/communications/auto-send.ts", {
    "server-only": {}, "@/lib/email": { queueBookingStatusEmail: async (...args: unknown[]) => { calls.push(args); } },
    "@/lib/prisma": { prisma: { booking: { findFirst: async () => { queries++; return booking; } } } },
    "@/lib/site": { getCurrentSiteId: async () => "site-a" },
  });
  await loaded.queueCommunicationsEventEmails("booking.rescheduled", { siteId: "site-a", relatedId: "booking", metadata: { notifyCustomer: false } });
  assert.equal(calls.length, 0);
  assert.equal(queries, 0);
  await loaded.queueCommunicationsEventEmails("booking.rescheduled", { siteId: "site-a", relatedId: "booking", metadata: { notifyCustomer: true } });
  assert.equal(calls.length, 1);
  assert.equal((calls[0][2] as Record<string, unknown>).templateKey, "booking.rescheduled.customer");
  assert.equal((calls[0][2] as Record<string, unknown>).idempotencyKey, "booking:booking:rescheduled:2026-10-20T10:00:00.000Z:customer");
});

test("customer cancellation email tokens include the disclosed reason and omit internal notes", async () => {
  const calls: Record<string, unknown>[] = [];
  const loaded = loadMocked("lib/email/events.ts", {
    "@/lib/format": { formatDateTime: () => "October 20", formatMoney: () => "$25" },
    "@/lib/site": { getSiteSettingsForSite: async () => ({ businessName: "Test site", timezone: "UTC" }) },
    "./queue": { queueEmail: async (input: Record<string, unknown>) => { calls.push(input); }, queueAdminEmail: async () => {} },
  });
  await loaded.queueBookingStatusEmail({ id: "booking", siteId: "site-a", customerName: "Test", customerEmail: "test@example.invalid", startsAt: new Date("2026-10-20T10:00Z"), endsAt: new Date("2026-10-20T11:00Z"), status: "CANCELED", service: { name: "Head spa" }, cancellationReason: "Weather", adminNotes: "Private staff discussion" });
  assert.equal(calls.length, 1);
  assert.equal((calls[0].tokens as Record<string, unknown>).cancellationReason, "Weather");
  assert.equal("adminNotes" in (calls[0].tokens as Record<string, unknown>), false);
  assert.ok(!JSON.stringify(calls[0]).includes("Private staff discussion"));
});


test("actual inspector renderer offers catalog selection, display-only and approved style controls", () => {
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  const registry = { blockRegistry, emptyFields };
  const editor = loadMocked("modules/content/studio/editor.tsx", {
    "./field-layout": { imageFirst }, "@/components/ui/asset-picker": {}, "./registry": registry,
    "./actions": {}, "./studio.module.css": styles, "./rich-text": {}, "./visual-block": {},
  });
  const fields = loadMocked("modules/content/studio/content-fields.tsx", { "./editor": { Fields: editor.Fields }, "./registry": registry, "./studio.module.css": styles });
  const block = configuredBlock("menu", "showcase", ["home"], { cardVariants: [{ label: "Compact", value: "compact" }] });
  const html = renderToStaticMarkup(createElement(fields.ContentFields as unknown as ComponentType<Record<string, unknown>>, {
    block, value: { heading: "Menu", items: [rows[0]] }, onChange() {}, canUpload: false,
    choices: [service, product].map(item => ({ id: item.key, label: `${item.kind}: ${item.name}` })), linkOptions: { pages: [], services: [] },
  }));
  for (const text of ["Add cards", "Service or product", "service: Head spa", "product: Care kit", "Display only (hide action)", "Compact", "Site default"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('name="description"'));
  const stale = renderToStaticMarkup(createElement(fields.ContentFields as unknown as ComponentType<Record<string, unknown>>, {
    block, value: { heading: "Menu", items: [rows[0]] }, onChange() {}, canUpload: false, choices: [], linkOptions: { pages: [], services: [] },
  }));
  assert.ok(stale.includes("Unavailable item"));
});

test("showcase publication requires content-manage authorization before reading tenant data", async () => {
  let reads = 0;
  const loaded = loadMocked("modules/content/studio/actions.ts", {
    "next/cache": {}, "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "content:manage"); throw new Error("Forbidden"); } },
    "@/lib/audit": {}, "@/lib/media": {}, "@/lib/prisma": { prisma: {} },
    "@/lib/site": { resolveCurrentSite: async () => { reads++; return { id: "site-a" }; } },
    "@/clients/content-editor-manifests": {}, "./state": {}, "./business-info": {}, "./manifest": {}, "./showcase-catalog": {},
  });
  await assert.rejects(() => loaded.saveStudioBlock({}) as Promise<unknown>, /Forbidden/);
  assert.equal(reads, 0);
});


test("public studio refreshes catalog bindings on each request without page republishing", async () => {
  let catalog = [service, product];
  const block = configuredBlock("menu", "showcase", ["home"], { defaults: { heading: "Menu", items: rows } });
  const loaded = loadMocked("modules/content/studio/public.ts", {
    "server-only": {}, "@/lib/env": { publicAppBaseUrl: () => "https://admin.example" }, "@/lib/media": {},
    "@/lib/site": { getSiteSettingsForSite: async () => ({ siteId: "site-a", publicContentConfig: {}, enabledModuleIds: ["content", "scheduling", "products"] }) },
    "@/lib/prisma": { prisma: {} }, "@/clients/content-editor-manifests": { getEditorManifest: async () => ({ ...manifest, blocks: [block] }) },
    "./state": { readStudio, resolveStudioPayload }, "./business-info": { resolveBusinessInfo: () => ({}) }, "./manifest": { blockDependenciesAvailable },
    "@/lib/embed/gateway": {}, "./rich-text": {}, "@/lib/catalog-media-url": { catalogMediaUrl },
    "./showcase-catalog": { showcaseCatalog: async () => catalog }, "./showcase": { resolveShowcase },
  });
  const first = await loaded.getPublicStudio("site-a", "home") as { blocks: { payload: { items: { name: string; priceCents: number; catalogKey?: string }[] } }[] };
  assert.equal(first.blocks[0].payload.items[0].name, "Head spa");
  catalog = [{ ...product, name: "New kit", priceCents: 3200 }];
  const second = await loaded.getPublicStudio("site-a", "home") as typeof first;
  assert.equal(second.blocks[0].payload.items.length, 1);
  assert.equal(second.blocks[0].payload.items[0].name, "New kit");
  assert.equal(second.blocks[0].payload.items[0].priceCents, 3200);
  assert.equal("catalogKey" in second.blocks[0].payload.items[0], false);
  assert.equal((block.defaults!.items as typeof rows)[1].catalogKey, "product:p1");
});
