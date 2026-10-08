import assert from "node:assert/strict";
import { createHash, randomFillSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { MediaAsset } from "@prisma/client";
import { NextRequest } from "next/server";
import sharp from "sharp";
import ts from "typescript";
import { galleryProofMaxEdge, galleryProofObjectKey, renderGalleryProof } from "../lib/media-proofs";
import { unreferencedMediaWhere } from "../lib/media-usage";
import { slugify } from "../lib/slug";
import * as galleryValidation from "../modules/portfolio/client-gallery-validation";

const MiB = 1024 * 1024;
const galleryOptions = {
  allowedMimeTypes: galleryValidation.clientGalleryImageTypes,
  maxBytes: galleryValidation.clientGalleryUploadMaxBytes,
  maxPixels: galleryValidation.clientGalleryUploadMaxPixels,
  requireImage: true
};

function loadMocked<T>(filename: string, mocks: Record<string, unknown>, directory: string): T {
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const exports = {};
  const require = createRequire(path.resolve(filename));
  runInNewContext(source, {
    exports, Buffer, File, FormData, Headers, Request, Response, URL, URLSearchParams, console,
    process: { cwd: () => directory, env: { NODE_ENV: "test", MEDIA_ASSET_DIR: directory } },
    require: (name: string) => name in mocks ? mocks[name] : require(name)
  });
  return exports as T;
}

function uploadHarness(directory: string) {
  const assets: MediaAsset[] = [];
  const links: { mediaAssetId: string; sortOrder: number }[] = [];
  const permissions: string[] = [];
  const galleryItems = {
    findMany: async () => links,
    createMany: async ({ data }: { data: typeof links }) => { links.push(...data); return { count: data.length }; }
  };
  const galleries = {
    findFirst: async () => ({ id: "gallery-large", title: "High-resolution shoot", slug: "high-resolution-shoot" }),
    updateMany: async () => ({ count: 1 })
  };
  const prisma = {
    mediaAsset: {
      create: async ({ data }: { data: MediaAsset }) => {
        const asset = { ...data, deletedAt: null };
        assets.push(asset);
        return asset;
      },
      findMany: async () => assets
    },
    client: { findFirst: async () => ({ id: "client-large", name: "Test client", email: "client@example.test" }) },
    portfolioGallery: galleries,
    portfolioGalleryItem: galleryItems,
    $transaction: async (work: (tx: { portfolioGallery: typeof galleries; portfolioGalleryItem: typeof galleryItems }) => Promise<unknown>) =>
      work({ portfolioGallery: galleries, portfolioGalleryItem: galleryItems })
  };
  // Keep upload validation, MIME sniffing, disk storage, signatures, and Sharp
  // real. Only application boundaries are replaced; no live DB or auth is used.
  const media = loadMocked<typeof import("../lib/media")>("lib/media.ts", {
    "server-only": {},
    "@/lib/prisma": { prisma },
    "@/lib/media-proofs": { galleryProofObjectKey, renderGalleryProof },
    "@/lib/media-usage": { unreferencedMediaWhere },
    "@/lib/security/urls": { isSafeExternalHttpsUrl: () => false },
    "@/lib/site": { getCurrentSiteId: async () => "site-large" },
    "@/lib/slug": { slugify }
  }, directory);
  const scopedWhere = async (_user: unknown, siteId: string, where: Record<string, unknown>) => ({ ...where, siteId });
  const actions = loadMocked<typeof import("../modules/portfolio/client-actions")>("modules/portfolio/client-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/prisma": { prisma },
    "@/lib/media": media,
    "@/lib/slug": { slugify },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-large", mediaDriver: "SERVER_ASSETS", enabledModuleIds: ["portfolio", "media"] }) },
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { permissions.push(permission); return { id: "test-admin" }; },
      assertAdminCan: (_user: unknown, permission: string) => { permissions.push(permission); },
      getAccessibleClientWhere: scopedWhere, getAccessibleGalleryWhere: scopedWhere, getAccessibleMediaWhere: scopedWhere,
      getOwnerStaffIds: async () => ["test-staff"], resolveDataScopeMode: async () => "ALL", hasAdminPermission: () => true
    },
    "./client-gallery-validation": galleryValidation
  }, directory);
  return { media, actions, assets, links, permissions };
}

function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function noisyJpegFixtures() {
  // Genuine 24 MP, high-quality JPEGs. Noise is deliberately hard to compress;
  // no byte padding or malformed image headers are used to reach the limits.
  const pixels = randomFillSync(Buffer.allocUnsafe(6000 * 4000 * 3));
  const encode = (quality: number) => sharp(pixels, { raw: { width: 6000, height: 4000, channels: 3 } })
    .jpeg({ quality, chromaSubsampling: "4:2:0" }).toBuffer();
  return { accepted: await encode(95), oversized: await encode(98) };
}

test("large gallery JPEGs roundtrip through the real upload, storage, and proof pipeline", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "showrunner-large-jpeg-"));
  try {
    const { accepted, oversized } = await noisyJpegFixtures();
    assert.ok(accepted.length > 20 * MiB && accepted.length < 25 * MiB, "accepted fixture must genuinely exercise the 20–25 MiB range");
    assert.ok(oversized.length > 25 * MiB, "oversized fixture must be a genuine JPEG above the cap");
    const metadata = await sharp(accepted).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 6000);
    assert.equal(metadata.height, 4000);
    assert.equal((await sharp(oversized).metadata()).format, "jpeg");
    t.diagnostic(`Valid 6000×4000 JPEG fixtures: ${accepted.length} bytes accepted; ${oversized.length} bytes rejected.`);
    const originalHash = digest(accepted);
    const file = new File([Uint8Array.from(accepted)], "high-resolution-shoot.jpg", { type: "image/jpeg" });
    const harness = uploadHarness(directory);

    await t.test("gallery action stores every original byte and creates a separate reduced proof", async () => {
      const form = new FormData();
      form.set("clientId", "client-large");
      form.set("galleryId", "gallery-large");
      form.set("file", file);
      const result = await harness.actions.uploadClientGalleryPhotoAction(form);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.ok(result.ok);
      assert.equal(result.data.added, 1);
      assert.equal(harness.assets.length, 1);
      assert.equal(harness.links[0].mediaAssetId, result.data.assetId);
      assert.deepEqual(harness.permissions, ["portfolio:manage", "clients:manage", "media:manage"]);
      const asset = harness.assets[0];
      assert.equal(asset.isPrivate, true);
      assert.equal(asset.siteId, "site-large");
      assert.equal(asset.driver, "SERVER_ASSETS");
      assert.equal(asset.sizeBytes, accepted.length);
      assert.equal(asset.mimeType, "image/jpeg");
      assert.match(asset.key, /^sites\/site-large\/uploads\/client-shoots\/client-large\/gallery-large\/.+\.jpg$/);
      assert.equal(digest(await readFile(path.join(directory, asset.key))), originalHash);

      const proof = await harness.media.galleryProofResponse(asset, "FULL");
      assert.ok(proof);
      assert.equal(proof.status, 200);
      assert.equal(proof.headers.get("content-type"), "image/webp");
      assert.equal(proof.headers.get("cache-control"), "private, no-store");
      assert.equal(proof.headers.get("x-media-variant"), "WATERMARKED_PROOF");
      const proofBytes = Buffer.from(await proof.arrayBuffer());
      const proofMetadata = await sharp(proofBytes).metadata();
      assert.equal(proofMetadata.format, "webp");
      assert.equal(proofMetadata.width, galleryProofMaxEdge);
      assert.ok(proofMetadata.height! < 4000);
      assert.ok(proofBytes.length < accepted.length);
      assert.notEqual(digest(proofBytes), originalHash);
      assert.equal(digest(await readFile(path.join(directory, galleryProofObjectKey(asset, "preview")))), digest(proofBytes));
      assert.equal(digest(await readFile(path.join(directory, asset.key))), originalHash, "proof rendering cannot rewrite the original");

      const download = await harness.media.galleryOriginalDeliveryResponse(asset, new NextRequest("https://studio.example/api/media/assets/test"));
      assert.ok(download);
      assert.equal(download.status, 200);
      assert.match(download.headers.get("content-disposition") || "", /attachment/);
      assert.equal(digest(new Uint8Array(await download.arrayBuffer())), originalHash, "original delivery preserves the uploaded bytes");
    });

    await t.test("ordinary Media keeps its 12 MiB default and all callers keep the 25 MiB hard cap", async () => {
      const filesBefore = await readdir(directory, { recursive: true });
      const upload = (source: File, options = {}) => harness.media.uploadMedia(source, { isPrivate: true, alt: source.name }, "SERVER_ASSETS", "site-large", options);
      await assert.rejects(upload(file), /smaller than 12 MB/);
      const tooLarge = new File([Uint8Array.from(oversized)], "oversized.jpg", { type: "image/jpeg" });
      await assert.rejects(upload(tooLarge, galleryOptions), /smaller than 25 MB/);
      await assert.rejects(upload(tooLarge, { ...galleryOptions, maxBytes: 50 * MiB }), /smaller than 25 MB/);
      assert.equal(harness.assets.length, 1, "rejections must not create Media records");
      assert.deepEqual(await readdir(directory, { recursive: true }), filesBefore, "rejections must not write stored objects");
    });

    await t.test("the larger size allowance still verifies actual file signatures", async () => {
      const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "navy" } }).png().toBuffer();
      const disguised = new File([Uint8Array.from(png)], "not-really-a-jpeg.jpg", { type: "image/jpeg" });
      await assert.rejects(harness.media.uploadMedia(disguised, { isPrivate: true, alt: "Disguised image" }, "SERVER_ASSETS", "site-large", galleryOptions), /contents do not match/);
      assert.equal(harness.assets.length, 1);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the 80 MP gallery decode gate rejects a genuine oversized-pixel JPEG before storage", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "showrunner-pixel-gate-"));
  try {
    // A flat, valid JPEG compresses well while exceeding the existing decode
    // budget. Encoding is sequential with the large-upload test to bound memory.
    const source = await sharp({ create: { width: 9001, height: 9000, channels: 3, background: "navy" } }).jpeg({ quality: 90 }).toBuffer();
    const metadata = await sharp(source, { limitInputPixels: false }).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.ok(metadata.width! * metadata.height! > 80_000_000);
    assert.ok(source.length < 25 * MiB, "pixel guard must work independently of the byte limit");
    const file = new File([Uint8Array.from(source)], "over-80-megapixels.jpg", { type: "image/jpeg" });
    const harness = uploadHarness(directory);
    await assert.rejects(harness.media.uploadMedia(file, { isPrivate: true, alt: "Over pixel budget" }, "SERVER_ASSETS", "site-large", galleryOptions), /pixel/i);
    await assert.rejects(renderGalleryProof(source), /pixel/i);
    assert.equal(harness.assets.length, 0);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
