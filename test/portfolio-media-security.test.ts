import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { galleryProofMaxEdge, galleryProofObjectKey, renderGalleryProof } from "../lib/media-proofs";
import { mediaReferenceCount, unreferencedMediaWhere } from "../lib/media-usage";

function loadMocked(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const require = createRequire(import.meta.url);
  runInNewContext(source, { exports, Buffer, Response, Headers, URL, URLSearchParams, console, process, ...globals, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return exports;
}

const asset = { id: "asset-a", deletedAt: null, driver: "SERVER_ASSETS", filename: "portrait.jpg", isPrivate: true, key: "sites/site-a/original.jpg", mimeType: "image/jpeg", storageProviderId: "", url: "/api/media/assets/asset-a?variant=FULL" };
function request(query = "") { return { nextUrl: new URL(`https://studio.example/api/portfolio/galleries/session/media/item-a?${query}`) }; }
function routeHarness(overrides: { access?: boolean; accessClientId?: string | null; entitled?: boolean; publicGallery?: boolean; clientId?: string | null; privateAsset?: boolean; downloadable?: boolean; downloadEnabled?: boolean; privateUsage?: boolean; deleted?: boolean; noAsset?: boolean } = {}) {
  const calls = { proof: 0, original: 0, public: 0, entitlement: [] as unknown[], queries: [] as Record<string, unknown>[] };
  const gallery = { id: "gallery-a", visibility: overrides.publicGallery ? "PUBLIC" : "PRIVATE", clientId: overrides.clientId === undefined ? "client-a" : overrides.clientId, downloadEnabled: overrides.downloadEnabled !== false };
  const item = { id: "item-a", gallery, mediaAssetId: "asset-a", isDownloadable: overrides.downloadable !== false, isWatermarked: false };
  const api = loadMocked("modules/portfolio/api/media.ts", {
    "next/server": {},
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a", enabledModuleIds: ["portfolio"] }) },
    "@/lib/prisma": { prisma: {
      portfolioGalleryItem: { findFirst: async (query: Record<string, unknown>) => { calls.queries.push(query); return "mediaAssetId" in (query.where as object) ? overrides.privateUsage ? { id: "other-private-item" } : null : item; } },
      mediaAsset: { findFirst: async () => overrides.noAsset ? null : { ...asset, isPrivate: overrides.privateAsset !== false, deletedAt: overrides.deleted ? new Date() : null } }
    } },
    "@/lib/portfolio/access": { findActiveGalleryAccess: async () => overrides.access === false ? null : { id: "access-a", clientId: overrides.accessClientId === undefined ? "client-a" : overrides.accessClientId } },
    "@/lib/portfolio/purchases": { authorizeGalleryOriginal: async (input: unknown) => { calls.entitlement.push(input); return overrides.entitled === true; } },
    "@/lib/public-rate-limit": { publicRateLimitMessage: async () => "" },
    "@/lib/media": {
      normalizeMediaVariantType: (value: string | null) => ["THUMBNAIL", "CARD", "HERO", "FULL", "SOCIAL", "DOWNLOAD"].includes((value || "").toUpperCase()) ? value!.toUpperCase() : "FULL",
      galleryProofResponse: async () => { calls.proof++; return new Response("burned-in-proof"); },
      galleryOriginalDeliveryResponse: async () => { calls.original++; return new Response("original"); },
      mediaDeliveryResponse: async () => { calls.public++; return new Response("public"); }
    }
  });
  return { calls, get: (query: string) => api.GET(request(query), { params: Promise.resolve({ itemId: "item-a", slug: "session" }) }) as Promise<Response> };
}

test("every private display variant is a burned-in proof even with watermark flag off", async () => {
  for (const variant of ["THUMBNAIL", "CARD", "HERO", "FULL", "SOCIAL", "ORIGINAL", "garbage"]) {
    const route = routeHarness();
    assert.equal((await route.get(`access=valid&variant=${variant}`)).status, 200);
    assert.equal(route.calls.proof, 1);
    assert.equal(route.calls.original, 0);
    assert.equal(route.calls.public, 0);
  }
});

test("private DOWNLOAD and download flags cannot bypass exact paid entitlement", async () => {
  for (const query of ["variant=DOWNLOAD", "variant=download", "variant=FULL&download=1", "download=1"]) {
    const route = routeHarness();
    assert.equal((await route.get(`access=valid&${query}`)).status, 404);
    assert.equal(route.calls.original, 0);
    assert.equal(route.calls.proof, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(route.calls.entitlement)), [{ siteId: "site-a", galleryId: "gallery-a", itemId: "item-a", mediaAssetId: "asset-a", accessId: "access-a" }]);
  }
  for (const options of [{ downloadEnabled: false }, { downloadable: false }, { access: false }]) {
    const route = routeHarness({ ...options, entitled: true });
    assert.equal((await route.get("access=valid&variant=DOWNLOAD")).status, 404);
    assert.equal(route.calls.original, 0);
    assert.equal(route.calls.entitlement.length, 0);
  }
  const paid = routeHarness({ entitled: true });
  assert.equal((await paid.get("access=valid&variant=DOWNLOAD&accessId=forged")).status, 200);
  assert.equal(paid.calls.original, 1);
  assert.equal(paid.calls.proof, 0);
});

test("gallery authorization and storage checks reject invalid inputs", async () => {
  const route = routeHarness({ access: false });
  assert.equal((await route.get("access=revoked&variant=CARD")).status, 404);
  assert.equal(route.calls.proof, 0);
  const where = route.calls.queries[0].where as { gallery: { siteId: string; status: string } };
  assert.equal(where.gallery.siteId, "site-a");
  assert.equal(where.gallery.status, "PUBLISHED");
  for (const options of [{ privateAsset: false }, { deleted: true }, { noAsset: true }]) {
    const invalid = routeHarness(options);
    assert.equal((await invalid.get("access=valid&variant=CARD")).status, 404);
    assert.equal(invalid.calls.proof, 0);
  }
  const legacy = routeHarness({ clientId: null });
  assert.equal((await legacy.get("access=valid&variant=DOWNLOAD")).status, 404);
  const accidentallyPublicShoot = routeHarness({ publicGallery: true });
  assert.equal((await accidentallyPublicShoot.get("variant=CARD")).status, 404);
});

test("curated public images work but cannot expose a private or cross-linked source", async () => {
  const publicImage = routeHarness({ publicGallery: true, clientId: null, privateAsset: false });
  assert.equal((await publicImage.get("variant=CARD")).status, 200);
  assert.equal(publicImage.calls.public, 1);
  for (const options of [{ privateAsset: true }, { privateAsset: false, privateUsage: true }]) {
    const route = routeHarness({ publicGallery: true, clientId: null, ...options });
    assert.equal((await route.get("access=valid&variant=CARD")).status, 404);
    assert.equal(route.calls.public, 0);
  }
});

test("actual proofs shrink pixels, burn visible marks into every quadrant, strip EXIF and preserve the source", async () => {
  const original = await sharp({ create: { width: 3200, height: 2400, channels: 3, background: { r: 95, g: 95, b: 95 } } }).withExif({ IFD0: { Copyright: "Private original metadata" } }).jpeg().toBuffer();
  const snapshot = Buffer.from(original);
  const rendered = await renderGalleryProof(original);
  const metadata = await sharp(rendered.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, galleryProofMaxEdge);
  assert.equal(metadata.height, 1050);
  assert.equal(metadata.exif, undefined);
  assert.deepEqual(original, snapshot);
  assert.equal((await sharp(original).metadata()).width, 3200);
  for (const top of [0, 525]) for (const left of [0, 700]) {
    const region = await sharp(rendered.data).extract({ top, left, width: 700, height: 400 }).stats();
    assert.ok(region.channels[0].max - region.channels[0].min > 60, "watermark is embedded in each image region");
  }
  const small = await sharp({ create: { width: 200, height: 100, channels: 3, background: "gray" } }).png().toBuffer();
  assert.equal((await renderGalleryProof(small)).info.width, 150);
  assert.ok((await renderGalleryProof(original, "thumbnail")).info.width <= 420);
  await assert.rejects(renderGalleryProof(Buffer.from("%PDF-not-an-image")));
  assert.notEqual(galleryProofObjectKey({ id: "a", key: "a.jpg" }, "preview"), galleryProofObjectKey({ id: "a", key: "replacement.jpg" }, "preview"));
  assert.ok(galleryProofObjectKey({ id: "a", key: "../../original.jpg" }, "preview").startsWith("private/proofs/burned-proof-v1/"));
});

test("shared media counts and write guards include galleries and immutable purchased selections", () => {
  assert.equal(mediaReferenceCount({ clientFiles: 1, productMedia: 2, services: 3, serviceCategories: 4, portfolioItems: 5, purchasedSelections: 6 }), 21);
  assert.deepEqual(unreferencedMediaWhere.portfolioItems, { none: {} });
  assert.deepEqual(unreferencedMediaWhere.purchasedSelections, { none: {} });
});

function mediaHarness(directory: string, extra: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  return loadMocked("lib/media.ts", {
    "server-only": {},
    "@/lib/prisma": { prisma: {} },
    "@/lib/media-proofs": { galleryProofObjectKey, renderGalleryProof },
    "@/lib/media-usage": { unreferencedMediaWhere },
    "@/lib/security/urls": { isSafeExternalHttpsUrl: () => false },
    "@/lib/site": { getCurrentSiteId: async () => "site-a" },
    "@/lib/slug": { slugify: (value: string) => value },
    ...extra
  }, { process: { env: { MEDIA_ASSET_DIR: directory, ...env }, cwd: () => directory } });
}

test("real private proof delivery caches separately and never returns the source on failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "showrunner-proof-test-"));
  try {
    const original = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "navy" } }).jpeg().toBuffer();
    await writeFile(path.join(directory, "original.jpg"), original);
    const source = { ...asset, key: "original.jpg" };
    const media = mediaHarness(directory);
    const proof = await media.galleryProofResponse(source, "FULL") as Response;
    assert.equal(proof.status, 200);
    assert.equal(proof.headers.get("cache-control"), "private, no-store");
    assert.equal(proof.headers.get("x-media-variant"), "WATERMARKED_PROOF");
    assert.equal(proof.headers.get("location"), null);
    const bytes = Buffer.from(await proof.arrayBuffer());
    assert.ok((await sharp(bytes).metadata()).width! < 1800);
    assert.deepEqual(await readFile(path.join(directory, "original.jpg")), original);
    assert.deepEqual(await readFile(path.join(directory, galleryProofObjectKey(source, "preview"))), bytes);
    const cached = await media.galleryProofResponse(source, "CARD") as Response;
    assert.deepEqual(Buffer.from(await cached.arrayBuffer()), bytes);
    for (const invalid of [{ ...source, isPrivate: false }, { ...source, driver: "REPO" }, { ...source, mimeType: "application/pdf" }, { ...source, deletedAt: new Date() }, { ...source, key: "missing.jpg" }]) {
      assert.equal(await media.galleryProofResponse(invalid, "FULL"), null);
    }
    await writeFile(path.join(directory, "broken.jpg"), Buffer.from("corrupt"));
    assert.equal(await media.galleryProofResponse({ ...source, key: "broken.jpg" }, "FULL"), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("entitled object-storage originals use short-lived exact-key signed attachment URLs", async () => {
  const calls: { key: string; bucket: string; ttl: number; disposition: string; cache: string }[] = [];
  const media = mediaHarness("/tmp", {
    "@aws-sdk/s3-request-presigner": { getSignedUrl: async (_client: unknown, command: { input: { Key: string; Bucket: string; ResponseContentDisposition: string; ResponseCacheControl: string } }, options: { expiresIn: number }) => {
      calls.push({ key: command.input.Key, bucket: command.input.Bucket, ttl: options.expiresIn, disposition: command.input.ResponseContentDisposition, cache: command.input.ResponseCacheControl });
      return "https://private-bucket.example/signed-original";
    } }
  }, { S3_BUCKET: "private-photos", S3_ENDPOINT: "https://storage.example", S3_ACCESS_KEY_ID: "synthetic-test-key", S3_SECRET_ACCESS_KEY: "synthetic-test-secret" });
  const result = await media.galleryOriginalDeliveryResponse({ ...asset, driver: "S3" }, request()) as Response;
  assert.equal(result.status, 307);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(calls, [{ key: asset.key, bucket: "private-photos", ttl: 60, disposition: 'attachment; filename="portrait.jpg"', cache: "private, no-store" }]);
  assert.equal(await media.galleryOriginalDeliveryResponse({ ...asset, isPrivate: false }, request()), null);
});

test("generic media signatures cannot bypass gallery entitlement or revoked client access", async () => {
  const calls = { delivery: 0, signature: 0, scoped: 0 };
  let user: object | null = null;
  let scoped = false;
  let privateGallery = true;
  const media = loadMocked("app/api/media/assets/[assetId]/route.ts", {
    "next/server": {},
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/prisma": { prisma: { mediaAsset: { findFirst: async (query: { select: { portfolioItems?: unknown } }) => query.select.portfolioItems ? { ...asset, portfolioItems: privateGallery ? [{ id: "item-a" }] : [], purchasedSelections: [] } : scoped ? { id: asset.id } : null } } },
    "@/lib/auth": { getAdminUser: async () => user, hasAdminPermission: () => true, getAccessibleMediaWhere: async () => { calls.scoped++; return { siteId: "site-a", id: asset.id }; } },
    "@/lib/media": { normalizeMediaVariantType: () => "DOWNLOAD", verifySignedMediaUrl: () => { calls.signature++; return true; }, mediaDeliveryResponse: async () => { calls.delivery++; return new Response("allowed"); } }
  });
  const get = () => media.GET(request("expires=9999999999&signature=previously-valid&variant=DOWNLOAD"), { params: Promise.resolve({ assetId: asset.id }) }) as Promise<Response>;
  assert.equal((await get()).status, 404);
  assert.equal(calls.signature, 0);
  assert.equal(calls.delivery, 0);
  user = { id: "staff-a" };
  assert.equal((await get()).status, 404, "a staff login still needs scoped asset access");
  scoped = true;
  assert.equal((await get()).status, 200);
  assert.equal(calls.scoped, 2);
  assert.equal(calls.signature, 0);
  privateGallery = false;
  user = null;
  assert.equal((await get()).status, 200, "ordinary signed private media keeps its prior contract");
  assert.equal(calls.signature, 1);
});

function actionHarness(references: number, archiveWriteCount = 1, privacy?: { desired: boolean; existing: boolean; purchased?: boolean }) {
  const writes: unknown[] = [];
  const mocks = {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "@/lib/admin-validation": { optionalStoredText: { refine: () => ({ transform: () => ({}) }) }, requiredText: { optional: () => ({}) }, parseForm: async () => ({ id: "asset-a", isPrivate: privacy?.desired }) },
    "@/lib/auth": { requireAdmin: async () => ({ id: "staff-a" }), getAccessibleMediaWhere: async () => ({ id: "asset-a", siteId: "site-a" }) },
    "@/lib/site": { getCurrentSiteId: async () => "site-a", getSiteSettingsForSite: async () => ({ heroImageUrl: "", logoImageUrl: "" }) },
    "@/lib/media": { mediaAssetIdFromUrl: () => "", normalizeMediaFolder: (value: string) => value, supportsPrivateMediaDriver: () => true },
    "@/lib/media-usage": { mediaReferenceCount, mediaReferenceCountSelect: {}, unreferencedMediaWhere },
    "@/modules/content/hero-presentation": {},
    "@/lib/prisma": { prisma: { mediaAsset: { findFirst: async () => ({ id: "asset-a", driver: "S3", isPrivate: privacy?.existing, clientFiles: [], portfolioItems: references ? [{ id: "item-a" }] : [], purchasedSelections: privacy?.purchased ? [{ id: "purchase-a" }] : [], _count: { clientFiles: 0, productMedia: 0, services: 0, serviceCategories: 0, portfolioItems: references, purchasedSelections: 0 } }), updateMany: async (query: unknown) => { writes.push(query); return { count: archiveWriteCount }; } } } }
  };
  // The schemas are real Zod, so use real primitive input types even though the
  // form parser is substituted to exercise only the server-side action guard.
  const require = createRequire(import.meta.url);
  const { z } = require("zod");
  mocks["@/lib/admin-validation"].optionalStoredText = z.string();
  mocks["@/lib/admin-validation"].requiredText = z.string();
  return { actions: loadMocked("modules/media/actions.ts", mocks), writes };
}

test("archive actions reject referenced media and recheck usage in the write", async () => {
  const linked = actionHarness(1);
  await assert.rejects(linked.actions.archiveMediaAssetAction(new FormData()), /still%20in%20use/);
  assert.equal(linked.writes.length, 0);
  const changed = actionHarness(0, 0);
  await assert.rejects(changed.actions.archiveMediaAssetAction(new FormData()), /changed%20or%20is%20still%20in%20use/);
  assert.equal(changed.writes.length, 1);
  const clean = actionHarness(0);
  await assert.rejects(clean.actions.archiveMediaAssetAction(new FormData()), /saved=archive/);
  const query = clean.writes[0] as { where: { AND: unknown[] } };
  assert.equal(query.where.AND[1], unreferencedMediaWhere);
});

test("media privacy changes cannot publish client originals or relabel previously public files as secure", async () => {
  for (const scenario of [{ references: 1, desired: false, existing: true }, { references: 0, desired: false, existing: true, purchased: true }]) {
    const linked = actionHarness(scenario.references, 1, scenario);
    await assert.rejects(linked.actions.updateMediaAssetAction(new FormData()), /Keep%20it%20private/);
    assert.equal(linked.writes.length, 0);
  }
  const formerlyPublic = actionHarness(0, 1, { desired: true, existing: false });
  await assert.rejects(formerlyPublic.actions.updateMediaAssetAction(new FormData()), /previously%20public%20file/);
  assert.equal(formerlyPublic.writes.length, 0);
});

test("orphan cleanup cannot delete an object that acquired shared references", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "showrunner-orphan-test-"));
  const source = { ...asset, key: "original.jpg" };
  await writeFile(path.join(directory, source.key), "synthetic original");
  let count = 0;
  const queries: unknown[] = [];
  const media = mediaHarness(directory, {
    "@/lib/prisma": { prisma: { mediaAsset: {
      findFirst: async () => source,
      deleteMany: async (query: unknown) => { queries.push(query); return { count }; }
    } } }
  });
  try {
    await media.deleteMediaAsset(source.id, "site-a");
    assert.equal(await readFile(path.join(directory, source.key), "utf8"), "synthetic original");
    assert.ok((queries[0] as { where: object }).where);
    count = 1;
    await media.deleteMediaAsset(source.id, "site-a");
    await assert.rejects(readFile(path.join(directory, source.key)), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("server asset folders inside Next public cannot serve as private storage", () => {
  const root = "/tmp/showrunner-private-storage-check";
  const privateStorage = mediaHarness(root);
  assert.equal(privateStorage.supportsPrivateMediaDriver("SERVER_ASSETS"), true);
  const publicStorage = mediaHarness(root, {}, { MEDIA_ASSET_DIR: path.join(root, "public", "uploads") });
  assert.equal(publicStorage.supportsPrivateMediaDriver("SERVER_ASSETS"), false);
  assert.equal(publicStorage.supportsPrivateMediaDriver("REPO"), false);
});

test("shoot proofs and originals reject active links assigned to a different or missing client", async () => {
  for (const accessClientId of ["client-b", null]) for (const variant of ["CARD", "FULL", "DOWNLOAD"]) {
    const route = routeHarness({ accessClientId, entitled: true });
    assert.equal((await route.get(`access=valid-but-wrong-client&variant=${variant}`)).status, 404);
    assert.equal(route.calls.proof, 0);
    assert.equal(route.calls.original, 0);
    assert.equal(route.calls.entitlement.length, 0);
  }
});
