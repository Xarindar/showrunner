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
function harness(overrides: { client?: boolean; package?: boolean; gallery?: boolean; assets?: Query[]; existing?: Query[]; allowed?: boolean; upload?: boolean; proof?: boolean; uploadError?: boolean } = {}) {
  const calls: Array<{ name: string; query: Query }> = [];
  const record = (name: string, value: unknown) => async (query: Query) => { calls.push({ name, query }); return value; };
  const assets = overrides.assets || [{ id: "asset-a", filename: "portrait.jpg", alt: "Portrait", folder: "Shoots/Autumn", url: "/api/media/assets/asset-a", isPrivate: true }];
  const db: Query = {
    mediaFolder: { findMany: record("savedFolders", []), upsert: record("rootFolder", {}), findUnique: async () => null, create: async ({ data }: Query) => { calls.push({ name: "createFolder", query: { data } }); return { id: data.name, ...data }; } },
    booking: { findFirst: record("booking", { id: "booking-a" }), findMany: record("bookings", []) },
    client: { update: record("lockClient", { id: "client-a", name: "Example client", mediaFolder: null }), findFirst: record("client", overrides.client === false ? null : { id: "client-a", name: "Example client", email: "client@example.test" }) },
    orderItem: { findFirst: record("package", overrides.package === false ? null : { id: "purchased-item" }) },
    portfolioGallery: {
      findFirst: record("gallery", overrides.gallery === false ? null : { id: "gallery-a", title: "Family shoot", slug: "family-shoot", bookingId: "booking-a", processingUploads: 0, processingStartedAt: null, processingError: "", _count: { items: 7 }, mediaFolder: { id: "folder-a", name: "Clients/Example client/Family shoot 11-11-2026" } }),
      update: record("saveGallery", {}),
      create: record("createGallery", { id: createInput.requestId }),
      updateMany: record("lockGallery", { count: 1 })
    },
    portfolioGalleryItem: { findMany: record("items", overrides.existing || []), createMany: record("addItems", { count: assets.length }) },
    portfolioGalleryAccess: { findFirst: record("access", { accessToken: "private-token" }) },
    messageTemplate: { upsert: record("template", {}) },
    emailOutbox: { findFirst: record("outbox", { status: "QUEUED" }) },
    serviceLibraryItem: { updateMany: record("lockAddon", { count: 1 }), findFirst: record("addon", { id: "custom-addon", siteId: "site-a", name: "User created name", pricingType: "PER_UNIT", priceCents: 1234, deliverables: { finalPhotos: 1 }, commerceProduct: null }), update: record("linkProduct", {}) },
    product: { upsert: record("product", { id: "internal-digital-product" }) },
    mediaAsset: { findMany: record("assets", assets), groupBy: record("folderGroups", [{ folder: "Shoots/Autumn" }]), count: record("assetCount", 100) }
  };
  db.$transaction = async (action: (tx: Query) => unknown) => action(db);
  const require = createRequire(import.meta.url);
  const mocks: Query = {
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { calls.push({ name: "permission", query: { permission } }); if (overrides.allowed === false) throw new Error("Unauthorized"); return { role: "PHOTOGRAPHER", id: "admin-a" }; },
      assertAdminCan: (_user: unknown, permission: string) => calls.push({ name: "permission", query: { permission } }),
      getAccessibleBookingWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { staffId: "staff-a" }] }),
      getAccessibleClientWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { owner: "staff-a" }] }),
      getAccessibleGalleryWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { photographerId: "staff-a" }] }),
      getAccessibleMediaWhere: async (_user: unknown, siteId: string, extra: unknown) => ({ AND: [{ siteId }, extra, { uploadedByStaffId: "staff-a" }] }),
      getOwnerStaffIds: async () => ["staff-a"], resolveDataScopeMode: async () => "OWN", hasAdminPermission: () => true
    },
    "@/lib/email": { queueEmail: record("email", undefined) },
    "@/lib/env": { publicAppBaseUrl: () => "https://admin.example.test" },
    "@/lib/prisma": { prisma: db },
    "@/lib/timezone": { getZonedDateKey: () => "2026-11-11" },
    "@/lib/site": { getSiteSettings: async () => ({ businessName: "Photo Studio", timezone: "America/Chicago", siteId: "site-a", mediaDriver: "S3", enabledModuleIds: ["portfolio", "media", "communications"] }) },
    "@/lib/slug": { slugify: (value: string) => value.toLowerCase().replaceAll(" ", "-") },
    "@/lib/media": {
      supportsPrivateMediaDriver: () => overrides.upload !== false, isMediaUploadDriverConfigured: () => true,
      galleryProofResponse: async (asset: Query, variant: string) => { calls.push({ name: "proof", query: { assetId: asset.id, variant } }); return { ok: overrides.proof !== false }; },
      mediaAssetDisplayUrl: (asset: Query, variant: string) => `signed-${variant.toLowerCase()}/${asset.id}`,
      uploadMedia: async (file: File, metadata: Query, driver: string, siteId: string, options: Query) => {
        calls.push({ name: "upload", query: { file, metadata, driver, siteId, options } }); if (overrides.uploadError) throw new Error("Storage failed"); return { id: "asset-a" };
      }
    },
    "next/cache": { revalidatePath: (path: string) => calls.push({ name: "refresh", query: { path } }) },
    "./client-gallery-validation": validation
  };
  const output = ts.transpileModule(readFileSync("modules/portfolio/client-actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported: Query = {};
  runInNewContext(output, { exports: exported, console: { error: () => {} }, File, Date, URL, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return { actions: exported, calls, db };
}

test("shoot terms are explicit, normalized, integer-safe, and never silently defaulted", () => {
  const parsed = validation.clientGalleryCreateSchema.parse(createInput);
  assert("selectionAllowance" in parsed);
  assert.equal(parsed.selectionAllowance, 12);
  assert.equal(parsed.extraPhotoPrice, 875);
  const european = validation.clientGalleryCreateSchema.parse({ ...createInput, extraPhotoPrice: "0", selectionAllowance: "0", selectionCurrency: "eur" });
  assert("selectionCurrency" in european);
  assert.equal(european.selectionCurrency, "EUR");
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
  assert.equal(result.data.assets[0].previewUrl, "signed-full/asset-a", "Preview uses the same scoped asset with a signed full-size variant");
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

const sessionInput = { clientId: "client-a", requestId: createInput.requestId, bookingId: "booking-a", title: "Wedding Shoot", description: "Evening portraits", sessionDate: "2026-11-11" };
test("scheduled sessions create private delivery galleries and readable reusable client folders", async () => {
  const { actions, calls, db } = harness({ gallery: false });
  assert.equal((await actions.createClientGalleryAction(sessionInput)).ok, true);
  const data = calls.find(call => call.name === "createGallery")!.query.data;
  assert.equal(data.bookingId, "booking-a"); assert.equal(data.description, "Evening portraits");
  assert.equal(data.shotAt.toISOString(), "2026-11-11T00:00:00.000Z");
  assert.equal(data.proofingEnabled, false); assert.equal(data.packageProductId, null);
  assert.equal(data.mediaFolderId, "Clients/Example client/Wedding Shoot 11-11-2026");
  db.client.update = async () => ({ id: "client-a", name: "Renamed client", mediaFolder: { id: "client-folder", name: "Clients/Example client" } });
  calls.length = 0;
  assert.equal((await actions.createClientGalleryAction({ ...sessionInput, requestId: "c3ee8a85-02f9-4944-a154-a7406126b829", title: "Return visit" })).ok, true);
  assert.equal(calls.filter(call => call.name === "createFolder").length, 1);
  assert.equal(calls.find(call => call.name === "createFolder")!.query.data.name, "Clients/Example client/Return visit 11-11-2026");
});

test("new sessions reject missing or inaccessible bookings and malformed dates or package terms", async () => {
  const { actions, calls, db } = harness({ gallery: false });
  db.booking.findFirst = async () => null;
  assert.equal((await actions.createClientGalleryAction(sessionInput)).ok, false);
  assert.equal(calls.some(call => call.name === "createGallery"), false);
  for (const patch of [{ bookingId: "" }, { sessionDate: "2026-02-30" }, { sessionDate: "11/11/2026" }, { packageProductId: "foreign-package" }]) {
    assert.equal(validation.clientGalleryCreateSchema.safeParse({ ...sessionInput, ...patch }).success, false);
  }
  assert.equal(validation.clientSessionFolderName("../Wedding/Party", "2026-11-11"), "..-Wedding-Party 11-11-2026");
});

test("client media picker uses direct folders at home and keeps search across folders", async () => {
  const { actions, calls } = harness();
  await actions.browseClientGalleryMediaAction({ clientId: "client-a", galleryId: "gallery-a" });
  assert.equal(calls.find(call => call.name === "assets")!.query.where.AND[1].folder, "");
  calls.length = 0;
  await actions.browseClientGalleryMediaAction({ clientId: "client-a", galleryId: "gallery-a", folder: "Shoots/Autumn" });
  assert.equal(calls.find(call => call.name === "assets")!.query.where.AND[1].folder, "Shoots/Autumn");
});

test("session folder collisions keep distinct clients and sessions separate", async () => {
  const { actions, calls, db } = harness({ gallery: false });
  db.mediaFolder.findUnique = async () => ({ id: "existing-folder" });
  assert.equal((await actions.createClientGalleryAction(sessionInput)).ok, true);
  const folders = calls.filter(call => call.name === "createFolder").map(call => call.query.data.name);
  assert.equal(folders[0], "Clients/Example client (client-a)");
  assert.equal(folders[1], `Clients/Example client (client-a)/Wedding Shoot 11-11-2026 (${sessionInput.requestId.slice(0, 8)})`);
});

test("image status reflects active generation, completed images, failures and interrupted jobs", () => {
  const now = Date.now();
  assert.equal(validation.clientGalleryImageStatus({ photoCount: 0 }), "Awaiting photos");
  assert.equal(validation.clientGalleryImageStatus({ photoCount: 3 }), "Ready");
  assert.equal(validation.clientGalleryImageStatus({ photoCount: 3, processingUploads: 2, processingStartedAt: new Date(now) }, now), "Images processing");
  assert.equal(validation.clientGalleryImageStatus({ photoCount: 3, processingError: "Failed" }), "Needs attention");
  assert.equal(validation.clientGalleryImageStatus({ photoCount: 3, processingUploads: 1, processingStartedAt: new Date(now - validation.clientPhotoProcessingTimeoutMs - 1) }, now), "Needs attention");
});

test("uploads keep processing status until both private preview sizes and gallery links are ready", async () => {
  const { actions, calls } = harness();
  const form = new FormData(); form.set("clientId", "client-a"); form.set("galleryId", "gallery-a"); form.set("file", new File(["photo"], "test.jpg", { type: "image/jpeg" }));
  assert.equal((await actions.uploadClientGalleryPhotoAction(form)).ok, true);
  const begin = calls.findIndex(call => call.query.data?.processingUploads?.increment === 1);
  const end = calls.findIndex(call => call.query.data?.processingUploads?.decrement === 1);
  const proofs = calls.flatMap((call, index) => call.name === "proof" ? [index] : []);
  assert.equal(proofs.length, 2);
  assert(proofs.every(index => index > begin && index < end));
  assert(calls.findIndex(call => call.name === "addItems") < end);
});

test("session rows combine photo collections for one booking without duplicating its scheduled row", () => {
  const galleries = [
    { id: "gallery-a", bookingId: "booking-a", title: "Photos", sessionDate: "2026-11-11", photoCount: 3, imageStatus: "Ready" },
    { id: "gallery-b", bookingId: "booking-a", title: "More photos", sessionDate: "2026-11-11", photoCount: 2, imageStatus: "Images processing" }
  ] as validation.ClientShootGallery[];
  const rows = validation.clientSessionRows({ sessions: [{ id: "booking-a", name: "Wedding", date: "2026-11-12" }], galleries });
  assert.equal(rows.length, 1); assert.equal(rows[0].photoCount, 5); assert.equal(rows[0].imageStatus, "Images processing");
  assert.equal(validation.clientSessionPath("client-a", rows[0].id), "/admin/clients/client-a/sessions/booking-a");
});

test("failed image generation clears its processing lease and leaves saved originals recoverable", async () => {
  for (const options of [{ proof: false }, { uploadError: true }]) {
    const { actions, calls } = harness(options);
    const form = new FormData(); form.set("clientId", "client-a"); form.set("galleryId", "gallery-a"); form.set("file", new File(["photo"], "test.jpg", { type: "image/jpeg" }));
    const result = await actions.uploadClientGalleryPhotoAction(form);
    assert.equal(result.ok, false);
    if (options.proof === false) assert.match(result.error, /saved privately to Media/);
    assert(calls.some(call => Boolean(call.query.data?.processingError)));
    assert(calls.some(call => call.query.data?.processingUploads?.decrement === 1));
    assert.equal(calls.some(call => call.name === "addItems"), false);
  }
});


test("session email is scoped, uses the stored recipient and private link, and queues through Communications", async () => {
  const { actions, calls } = harness();
  const input = { clientId: "client-a", galleryId: "gallery-a", requestId: createInput.requestId, recipientEmail: "attacker@example.test" };
  const result = await actions.sendClientGalleryEmailAction(input);
  assert.equal(result.ok, true);
  const email = calls.find(call => call.name === "email")!.query;
  assert.equal(email.siteId, "site-a");
  assert.equal(email.recipientEmail, "client@example.test");
  assert.equal(email.category, "TRANSACTIONAL");
  assert.equal(email.relatedType, "client"); assert.equal(email.relatedId, "client-a");
  assert.equal(email.tokens.galleryUrl, "https://admin.example.test/proofs/private-token");
  assert.equal(email.idempotencyKey, `gallery-ready:gallery-a:${createInput.requestId}`);
  assert.equal(Object.keys(calls.find(call => call.name === "template")!.query.update).length, 0, "Never overwrite a customized template");
  const booking = calls.find(call => call.name === "booking")!.query.where;
  assert.equal(booking.AND[0].siteId, "site-a");
  assert.equal(booking.AND[1].clientId, "client-a");
});

test("session email rejects inaccessible, processing, empty, failed or canceled sessions", async () => {
  for (const options of [{ client: false }, { gallery: false }]) {
    const { actions, calls } = harness(options);
    assert.equal((await actions.sendClientGalleryEmailAction({ ...createInput, galleryId: "gallery-a" })).ok, false);
    assert.equal(calls.some(call => call.name === "email"), false);
  }
  for (const state of [{ processingUploads: 1 }, { processingError: "Failed" }, { _count: { items: 0 } }]) {
    const { actions, calls, db } = harness();
    db.portfolioGallery.findFirst = async () => ({ id: "gallery-a", processingUploads: 0, processingStartedAt: new Date(), processingError: "", _count: { items: 7 }, ...state });
    assert.equal((await actions.sendClientGalleryEmailAction({ ...createInput, galleryId: "gallery-a" })).ok, false);
    assert.equal(calls.some(call => call.name === "email"), false);
  }
  const { actions, calls, db } = harness();
  db.booking.findFirst = async () => null;
  assert.equal((await actions.sendClientGalleryEmailAction({ ...createInput, galleryId: "gallery-a" })).ok, false);
  assert.equal(calls.some(call => call.name === "email"), false);
});

test("session email never reports suppressed or failed queue outcomes as sent", async () => {
  for (const status of ["SUPPRESSED", "FAILED", null]) {
    const { actions, db } = harness();
    db.emailOutbox.findFirst = async () => status ? { status } : null;
    const result = await actions.sendClientGalleryEmailAction({ ...createInput, galleryId: "gallery-a" });
    assert.equal(result.ok, false);
  }
});


test("new session uploads receive safe client/date names without changing bytes or MIME type", async () => {
  const { actions, calls } = harness();
  const form = new FormData();
  form.set("clientId", "client-a"); form.set("galleryId", "gallery-a");
  form.set("file", new File(["original image bytes"], "camera-file.JPG", { type: "image/jpeg" }));
  assert.equal((await actions.uploadClientGalleryPhotoAction(form)).ok, true);
  const uploaded = calls.find(call => call.name === "upload")!.query.file as File;
  assert.match(uploaded.name, /^Example client-2026-11-11-[a-f0-9]{12}\.jpg$/);
  assert.equal(uploaded.type, "image/jpeg");
  assert.equal(await uploaded.text(), "original image bytes");
  assert.equal(validation.clientSessionPhotoFilename('Ruby / Anderson', '2026-11-11', 'IMG_001.PNG', '12345678-abcd-4321'), 'Ruby - Anderson-2026-11-11-12345678abcd.png');
});


test("proof settings link a scoped user-created per-unit add-on rather than accepting a browser price", async () => {
  const { actions, calls, db } = harness();
  const input = { clientId: "client-a", galleryId: "gallery-a", includedCount: 2, addOnId: "custom-addon", currency: "USD", priceCents: 1 };
  assert.equal((await actions.configureClientGalleryProofingAction(input)).ok, true);
  const addon = calls.find(call => call.name === "addon")!.query.where;
  assert.equal(addon.siteId, "site-a"); assert.equal(addon.pricingType, "PER_UNIT");
  const saved = calls.find(call => call.name === "saveGallery")!.query.data;
  assert.equal(saved.selectionAllowance, 2); assert.equal(saved.extraPhotoAddOnId, "custom-addon"); assert.equal(saved.extraPhotoPriceCents, 1234);
  assert.equal(calls.find(call => call.name === "product")!.query.create.status, "DRAFT", "Internal checkout product is not published in the store");
  db.serviceLibraryItem.findFirst = async () => ({ id: "custom-addon", priceCents: 10, deliverables: { finalPhotos: 5 } });
  assert.equal((await actions.configureClientGalleryProofingAction(input)).ok, false, "Five-photo bundles cannot be silently priced as individual proofs");
});
