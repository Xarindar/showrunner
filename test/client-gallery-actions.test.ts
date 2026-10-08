import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Prisma } from "@prisma/client";
import * as validation from "../modules/portfolio/client-gallery-validation";

const createInput = {
  clientId: "client-a", requestId: "347bdb75-0e4d-4da4-8508-632389f85249", title: "Family shoot",
  packageProductId: "package-a", purchasedOrderId: "order-a", selectionAllowance: "12", extraPhotoPrice: "8.75", selectionCurrency: "USD"
};

// Mock database inputs intentionally cover several Prisma delegates with different shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;
function harness(overrides: { client?: boolean; package?: boolean; gallery?: boolean; assets?: Query[]; existing?: Query[]; allowed?: boolean; upload?: boolean } = {}) {
  const calls: Array<{ name: string; query: Query }> = [];
  const record = (name: string, value: unknown) => async (query: Query) => { calls.push({ name, query }); return value; };
  const assets = overrides.assets || [{ id: "asset-a", filename: "portrait.jpg", alt: "Portrait", folder: "Shoots/Autumn", url: "/api/media/assets/asset-a", isPrivate: true }];
  const db: Query = {
    client: { findFirst: record("client", overrides.client === false ? null : { id: "client-a", name: "Example client", email: "client@example.test" }) },
    orderItem: { findFirst: record("package", overrides.package === false ? null : { id: "purchased-item" }) },
    portfolioGallery: {
      findFirst: record("gallery", overrides.gallery === false ? null : { id: "gallery-a", title: "Family shoot", slug: "family-shoot" }),
      create: record("createGallery", { id: createInput.requestId }),
      updateMany: record("lockGallery", { count: 1 })
    },
    portfolioGalleryItem: { findMany: record("items", overrides.existing || []), createMany: record("addItems", { count: assets.length }) },
    mediaAsset: { findMany: record("assets", assets), count: record("assetCount", 100) }
  };
  db.$transaction = async (action: (tx: Query) => unknown) => action(db);
  const require = createRequire(import.meta.url);
  const mocks: Query = {
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { calls.push({ name: "permission", query: { permission } }); if (overrides.allowed === false) throw new Error("Unauthorized"); return { role: "PHOTOGRAPHER", id: "admin-a" }; },
      assertAdminCan: (_user: unknown, permission: string) => calls.push({ name: "permission", query: { permission } }),
      getAccessibleClientWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { owner: "staff-a" }] }),
      getAccessibleGalleryWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { photographerId: "staff-a" }] }),
      getAccessibleMediaWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { uploadedByStaffId: "staff-a" }] }),
      getOwnerStaffIds: async () => ["staff-a"], resolveDataScopeMode: async () => "OWN", hasAdminPermission: () => true
    },
    "@/lib/prisma": { prisma: db },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a", mediaDriver: "S3", enabledModuleIds: ["portfolio", "media"] }) },
    "@/lib/slug": { slugify: (value: string) => value.toLowerCase().replaceAll(" ", "-") },
    "@/lib/media": {
      supportsPrivateMediaDriver: () => overrides.upload !== false, isMediaUploadDriverConfigured: () => true,
      mediaAssetDisplayUrl: (asset: Query) => `signed-thumbnail/${asset.id}`,
      uploadMedia: async (file: File, metadata: Query, driver: string, siteId: string, options: Query) => {
        calls.push({ name: "upload", query: { file, metadata, driver, siteId, options } }); return { id: "asset-a" };
      }
    },
    "next/cache": { revalidatePath: (path: string) => calls.push({ name: "refresh", query: { path } }) },
    "./client-gallery-validation": validation
  };
  const output = ts.transpileModule(readFileSync("modules/portfolio/client-actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported: Query = {};
  runInNewContext(output, { exports: exported, console: { error: () => {} }, File, Date, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return { actions: exported, calls, db };
}

test("shoot terms are explicit, normalized, integer-safe, and never silently defaulted", () => {
  const parsed = validation.clientGalleryCreateSchema.parse(createInput);
  assert.equal(parsed.selectionAllowance, 12);
  assert.equal(parsed.extraPhotoPrice, 875);
  assert.equal(validation.clientGalleryCreateSchema.parse({ ...createInput, extraPhotoPrice: "0", selectionAllowance: "0", selectionCurrency: "eur" }).selectionCurrency, "EUR");
  for (const patch of [{ selectionAllowance: "" }, { selectionAllowance: "1.5" }, { extraPhotoPrice: "" }, { extraPhotoPrice: "-1" }, { extraPhotoPrice: "0.001" }, { selectionCurrency: "" }, { packageProductId: "" }, { purchasedOrderId: "" }]) {
    assert.equal(validation.clientGalleryCreateSchema.safeParse({ ...createInput, ...patch }).success, false);
  }
});

test("creation requires client access and a paid client-owned SERVICE_PACKAGE order", async () => {
  for (const options of [{ client: false }, { package: false }]) {
    const { actions, calls } = harness(options);
    const result = await actions.createClientGalleryAction(createInput);
    assert.equal(result.ok, false);
    assert.equal(calls.some((call) => call.name === "createGallery"), false);
  }
  const { actions, calls } = harness({ gallery: false });
  const result = await actions.createClientGalleryAction(createInput);
  assert.equal(result.ok, true);
  const packageWhere = calls.find((call) => call.name === "package")!.query.where;
  assert.equal(packageWhere.order.siteId, "site-a");
  assert.equal(packageWhere.order.clientId, "client-a");
  assert.equal(packageWhere.order.gallerySelectionPurchase.is, null, "extra-photo orders cannot create another package entitlement");
  assert.equal(packageWhere.product.siteId, "site-a");
  assert.equal(packageWhere.product.type, "SERVICE_PACKAGE");
  assert.deepEqual(Array.from(packageWhere.order.status.in), ["PAID", "FULFILLED"]);
  const data = calls.find((call) => call.name === "createGallery")!.query.data;
  assert.equal(data.visibility, "PRIVATE"); assert.equal(data.status, "PUBLISHED");
  assert.equal(data.clientId, "client-a"); assert.equal(data.purchasedOrderId, "order-a");
  assert.equal(data.selectionAllowance, 12); assert.equal(data.extraPhotoPriceCents, 875);
  assert.equal(data.downloadEnabled, true); assert.equal(data.proofingEnabled, true);
  assert.equal(data.accesses.create.clientId, "client-a");
  assert.equal(data.accesses.create.recipientEmail, "client@example.test");
});

test("package picker excludes paid extra-photo orders as well as unpaid or foreign-client orders", async () => {
  const { actions, calls, db } = harness();
  db.portfolioGallery.findMany = async (query: Query) => { calls.push({ name: "workspaceGalleries", query }); return []; };
  db.orderItem.findMany = async (query: Query) => { calls.push({ name: "workspacePackages", query }); return []; };
  const workspace = await actions.getClientGalleryWorkspace("client-a");
  assert.equal(workspace.packages.length, 0);
  const order = calls.find((call) => call.name === "workspacePackages")!.query.where.order;
  assert.equal(order.siteId, "site-a"); assert.equal(order.clientId, "client-a");
  assert.equal(order.gallerySelectionPurchase.is, null);
  assert.deepEqual(Array.from(order.status.in), ["PAID", "FULFILLED"]);
});

test("duplicate create retries reuse the exact accessible request; concurrent collision is recovered", async () => {
  const { actions, calls, db } = harness();
  assert.equal((await actions.createClientGalleryAction(createInput)).ok, true);
  assert.equal(calls.some((call) => call.name === "createGallery"), false);
  let lookups = 0;
  db.portfolioGallery.findFirst = async () => ++lookups === 1 ? null : { id: createInput.requestId };
  db.portfolioGallery.create = async () => { throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" }); };
  const raced = await actions.createClientGalleryAction(createInput);
  assert.equal(raced.ok, true); assert.equal(raced.data.galleryId, createInput.requestId);
});

test("visual media search spans all pages and enforces tenant, owner, private-image, and gallery scope", async () => {
  const { actions, calls } = harness();
  const result = await actions.browseClientGalleryMediaAction({ clientId: "client-a", galleryId: "gallery-a", query: "Autumn", page: 4 });
  assert.equal(result.ok, true); assert.equal(result.data.pageCount, 5);
  const query = calls.find((call) => call.name === "assets")!.query;
  assert.equal(query.skip, 72); assert.equal(query.take, 24);
  assert.equal(query.where.AND[0].siteId, "site-a"); assert.equal(query.where.AND[2].uploadedByStaffId, "staff-a");
  assert.equal(query.where.AND[1].isPrivate, true); assert.equal(query.where.AND[1].deletedAt, null);
  assert.equal(query.where.AND[1].OR.some((part: Query) => part.folder?.contains === "Autumn"), true);
  assert.equal(result.data.assets[0].thumbnailUrl, "signed-thumbnail/asset-a");
  assert.equal("url" in result.data.assets[0], false);
  const wrongClient = harness({ gallery: false });
  assert.equal((await wrongClient.actions.browseClientGalleryMediaAction({ clientId: "wrong-client", galleryId: "gallery-a" })).ok, false);
  assert.equal(wrongClient.calls.some((call) => call.name === "assets"), false);
});

test("batch selection rejects unavailable/public assets and does not duplicate existing gallery photos", async () => {
  const missing = harness({ assets: [] });
  assert.equal((await missing.actions.addClientGalleryMediaAction({ clientId: "client-a", galleryId: "gallery-a", assetIds: ["public-asset"] })).ok, false);
  assert.equal(missing.calls.some((call) => call.name === "addItems"), false);
  const duplicate = harness({ existing: [{ mediaAssetId: "asset-a", sortOrder: 0 }] });
  const result = await duplicate.actions.addClientGalleryMediaAction({ clientId: "client-a", galleryId: "gallery-a", assetIds: ["asset-a", "asset-a"] });
  assert.equal(result.ok, true); assert.equal(result.data.added, 0);
  assert.equal(duplicate.calls.some((call) => call.name === "lockGallery"), true);
  assert.equal(duplicate.calls.some((call) => call.name === "addItems"), false);
});

test("uploads use shared private Media with image-only validation and an independent per-file size cap", async () => {
  const { actions, calls } = harness();
  const form = new FormData(); form.set("clientId", "client-a"); form.set("galleryId", "gallery-a");
  form.set("file", new File(["test-image"], "portrait.jpg", { type: "image/jpeg" }));
  const result = await actions.uploadClientGalleryPhotoAction(form);
  assert.equal(result.ok, true);
  const upload = calls.find((call) => call.name === "upload")!.query;
  assert.equal(upload.siteId, "site-a"); assert.equal(upload.metadata.isPrivate, true);
  assert.equal(upload.metadata.uploadedByStaffId, "staff-a"); assert.equal(upload.options.requireImage, true);
  assert.equal(upload.options.maxBytes, validation.clientGalleryUploadMaxBytes);
  assert.equal(calls.find((call) => call.name === "addItems")!.query.data[0].isDownloadable, true);
  const bad = harness(); form.set("file", new File(["PDF"], "client.pdf", { type: "application/pdf" }));
  assert.equal((await bad.actions.uploadClientGalleryPhotoAction(form)).ok, false);
  assert.equal(bad.calls.some((call) => call.name === "upload"), false);
  form.set("file", new File([new Uint8Array(validation.clientGalleryUploadMaxBytes + 1)], "large.jpg", { type: "image/jpeg" }));
  assert.equal((await bad.actions.uploadClientGalleryPhotoAction(form)).ok, false);
  assert.equal(bad.calls.some((call) => call.name === "upload"), false);
});

test("authentication redirects/errors are never swallowed as successful action results", async () => {
  const { actions, calls } = harness({ allowed: false });
  await assert.rejects(actions.createClientGalleryAction(createInput), /Unauthorized/);
  assert.equal(calls.some((call) => call.name === "createGallery"), false);
});

test("gallery accepts full-resolution file sizes above 7 MiB through the existing 25 MiB ceiling", async () => {
  for (const size of [8 * 1024 * 1024, 25 * 1024 * 1024]) {
    const { actions, calls } = harness();
    const form = new FormData(); form.set("clientId", "client-a"); form.set("galleryId", "gallery-a");
    form.set("file", new File([new Uint8Array(size)], "high-resolution.jpg", { type: "image/jpeg" }));
    assert.equal((await actions.uploadClientGalleryPhotoAction(form)).ok, true);
    assert.equal(calls.find(call => call.name === "upload")!.query.options.maxPixels, 80_000_000);
  }
  const { actions, calls } = harness();
  const form = new FormData(); form.set("clientId", "client-a"); form.set("galleryId", "gallery-a");
  form.set("file", new File([new Uint8Array(25 * 1024 * 1024 + 1)], "too-large.jpg", { type: "image/jpeg" }));
  assert.equal((await actions.uploadClientGalleryPhotoAction(form)).ok, false);
  assert.equal(calls.some(call => call.name === "upload"), false);
});

test("gallery upload requests contain exactly one photo even when the UI selected a batch", async () => {
  const { actions, calls } = harness();
  const form = new FormData(); form.set("clientId", "client-a"); form.set("galleryId", "gallery-a");
  form.append("file", new File(["one"], "one.jpg", { type: "image/jpeg" }));
  form.append("file", new File(["two"], "two.jpg", { type: "image/jpeg" }));
  assert.equal((await actions.uploadClientGalleryPhotoAction(form)).ok, false);
  assert.equal(calls.some(call => call.name === "upload"), false);
});

test("gallery batch count and aggregate size are bounded independently of per-file allowance", () => {
  assert.equal(validation.clientGalleryUploadMaxBytes, 25 * 1024 * 1024);
  assert.equal(validation.clientGalleryBatchError(Array.from({ length: 10 }, () => ({ size: 25 * 1024 * 1024 }))), "");
  assert.match(validation.clientGalleryBatchError([{ size: 250 * 1024 * 1024 + 1 }]), /250 MiB/);
  assert.match(validation.clientGalleryBatchError(Array.from({ length: 11 }, () => ({ size: 25 * 1024 * 1024 }))), /250 MiB/);
  assert.equal(validation.clientGalleryBatchError(Array.from({ length: 100 }, () => ({ size: 1024 * 1024 }))), "");
  assert.match(validation.clientGalleryBatchError(Array.from({ length: 101 }, () => ({ size: 1 }))), /100 photos/);
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /bodySizeLimit: "26mb"/);
  assert.match(config, /proxyClientMaxBodySize: "26mb"/);
  const ui = readFileSync("modules/clients/detail/client-galleries-card.tsx", "utf8");
  assert.match(ui, /await uploadClientGalleryPhotoAction\(form\)/);
  assert.match(ui, /clientGalleryBatchError\(files\)/);
});
