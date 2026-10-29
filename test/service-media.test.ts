import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import { serviceMediaSchema, serviceMediaAssetIds } from "../lib/scheduling/service-media";
import { centeredFraming, readImageFraming } from "../modules/content/studio/image-framing";
import { mediaReferenceCount, unreferencedMediaWhere } from "../lib/media-usage";
import { servicePriceCents } from "../lib/scheduling/pricing";

const selection = { square: { assetId: "square", framing: centeredFraming }, rectangular: { assetId: "wide", framing: { ...centeredFraming, imageZoom: 1.5 } }, gallery: ["extra", "square", "extra"] };

test("service media keeps existing crops, assigns the first upload as main, and adds the rest to the gallery", () => {
  type Node = { type: unknown; props: Record<string, unknown> };
  const states: unknown[] = [];
  let cursor = 0;
  const jsx = (type: unknown, props: Node["props"]) => ({ type, props });
  const exports: { ServiceMediaFields?: (props: unknown) => Node } = {};
  const code = ts.transpileModule(readFileSync("modules/scheduling/components/service-media-fields.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  runInNewContext(code, { exports, Map, JSON, require: (id: string) => {
    if (id === "react") return { useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    } };
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id.endsWith("/asset-picker")) return { AssetPicker: "picker" };
    if (id.endsWith("/image-framing")) return { centeredFraming };
    if (id.endsWith("/notifications")) return { useNotify: () => () => {} };
    if (id.endsWith(".css")) return { default: {} };
    return {};
  } });
  const photo = { id: "old", filename: "old.jpg", url: "/old.jpg", thumbnailUrl: "/old.jpg", alt: "Original" };
  const props = { canUpload: true, initialSquare: { asset: photo, framing: { ...centeredFraming, imageZoom: 2 } }, initialRectangular: { asset: { ...photo, id: "wide" }, framing: selection.rectangular.framing } };
  const render = () => { cursor = 0; return exports.ServiceMediaFields!(props); };
  function nodes(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object" || !("props" in value)) return [];
    const node = value as Node;
    return [node, ...nodes(node.props.children)];
  }
  const payload = (tree: Node) => JSON.parse(String(nodes(tree).find(node => node.props.name === "serviceMedia")!.props.value));
  let tree = render();
  assert.equal(payload(tree).square.framing.imageZoom, 2);
  const pick = (tree: Node, title: string) => nodes(tree).find(node => node.props.title === title)!.props;
  (pick(tree, "Choose main photo").onSelectAsset as (asset: unknown) => void)(photo);
  tree = render();
  assert.equal(payload(tree).square.framing.imageZoom, 2, "reselecting the same photo keeps its crop");
  const main = { ...photo, id: "new" };
  (pick(tree, "Choose main photo").onUploadedAssets as (assets: unknown[]) => void)([main, { ...photo, id: "extra" }]);
  tree = render();
  assert.equal(payload(tree).square.assetId, "new");
  assert.equal(payload(tree).square.framing.imageZoom, 1);
  assert.deepEqual(payload(tree).gallery, ["extra"]);
  assert.deepEqual(payload(tree).rectangular, selection.rectangular);
  states[0] = null;
  tree = render();
  (pick(tree, "Add service photos").onUploadedAssets as (assets: unknown[]) => void)([photo, main]);
  assert.equal(payload(render()).square.assetId, "old");
  assert.deepEqual(payload(render()).gallery, ["extra", "new"]);
});

test("media validates framing and limits and deduplicates shared photo references", () => {
  assert.deepEqual(serviceMediaAssetIds(serviceMediaSchema.parse(selection)), ["square", "wide", "extra"]);
  assert.equal(serviceMediaSchema.safeParse({ ...selection, rectangular: { ...selection.rectangular, framing: { ...centeredFraming, imageZoom: 4 } } }).success, false);
  assert.equal(serviceMediaSchema.safeParse({ ...selection, gallery: Array(51).fill("extra") }).success, false);
});

function harness() {
  const writes: Array<{ where?: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const state = { allowed: true, missing: false, stale: false, legacy: false };
  const service = { id: "service", siteId: "site", imageUrl: "/legacy.jpg", mediaAssetId: null, sessionOffering: null };
  const schema = z.object({ id: z.string().optional(), name: z.string(), category: z.string().default("") });
  const db = {
    availabilityRule: { count: async () => 1 },
    service: {
      findFirst: async () => service,
      create: async (query: typeof writes[number]) => { writes.push(query); return service; },
      update: async (query: typeof writes[number]) => { if (state.stale) throw Object.assign(Error("stale"), { code: "P2025" }); writes.push(query); return service; }
    },
    mediaAsset: { findMany: async ({ where }: { where: Record<string, unknown> }) => {
      assert.equal(where.siteId, "site"); assert.equal(where.isPrivate, false); assert.equal(where.deletedAt, null);
      assert.equal(JSON.stringify(where.mimeType), JSON.stringify({ startsWith: "image/", mode: "insensitive" }));
      return state.missing ? [] : ((where.id as { in: string[] }).in).map(id => ({ id, url: `/${id}.jpg` }));
    } }
  };
  const mocks: Record<string, unknown> = {
    "@/lib/scheduling/service-media": { serviceMediaSchema, serviceMediaAssetIds },
    "@/lib/scheduling/service-library-store": { hydrateSessionServiceLibrary: async () => null },
    "@/lib/scheduling/session-offering": { readSessionOffering: () => null },
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "scheduling:manage"); if (!state.allowed) throw Error("Forbidden"); return {}; }, getAccessibleMediaWhere: async (_user: unknown, siteId: string, where: object) => ({ ...where, siteId }) },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site" }) },
    "@/lib/prisma": { prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } },
    "@/lib/admin-validation": { requiredText: z.string(), optionalStoredText: z.string(), serviceFormSchema: schema, serviceUpdateFormSchema: schema, parseForm: async (_schema: unknown, form: FormData) => schema.parse(Object.fromEntries(form)) },
    "@/lib/media": { mediaAssetDisplayUrl: (asset: { url: string }) => asset.url },
    "@/lib/services/service-slugs": { generateUniqueServiceSlug: async () => "service" },
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect: () => { throw Error("redirect"); }, unstable_rethrow: (error: Error) => { if (error.message === "redirect") throw error; } }
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (...args: unknown[]) => Promise<{ error: string }>> = {};
  const source = ts.transpileModule(readFileSync("modules/scheduling/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports: actions, Error, Date, URLSearchParams, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id) });
  const form = new FormData(); form.set("id", "service"); form.set("name", "Service"); form.set("updatedAt", "2026-10-21T12:00:00.000Z"); form.set("serviceMedia", JSON.stringify(selection));
  return { actions, writes, state, form };
}

test("create and edit save both crops and attached images, preserving legacy URLs and rejecting stale edits", async () => {
  const h = harness();
  await assert.rejects(h.actions.createServiceAction({}, h.form), /redirect/);
  assert.equal(h.writes[0].data.mediaAssetId, "square");
  assert.equal(h.writes[0].data.rectangularMediaAssetId, "wide");
  assert.equal(JSON.stringify(h.writes[0].data.galleryAssets), JSON.stringify({ connect: [{ id: "extra" }, { id: "square" }] }));
  await assert.rejects(h.actions.updateSessionTypeAction({}, h.form), /redirect/);
  assert.equal((h.writes[1].where!.updatedAt as Date).toISOString(), h.form.get("updatedAt"));
  assert.equal(JSON.stringify(h.writes[1].data.galleryAssets), JSON.stringify({ set: [{ id: "extra" }, { id: "square" }] }));
  h.state.stale = true;
  assert.match((await h.actions.updateSessionTypeAction({}, h.form)).error, /changed/);
  assert.equal(h.writes.length, 2);
  h.state.stale = false;
  h.form.set("serviceMedia", JSON.stringify({ square: { assetId: null, framing: centeredFraming }, rectangular: null, gallery: [] }));
  await assert.rejects(h.actions.updateSessionTypeAction({}, h.form), /redirect/);
  assert.equal(h.writes[2].data.imageUrl, "/legacy.jpg");
  assert.equal(h.writes[2].data.rectangularMediaAssetId, null);
});

test("unauthorized, inaccessible, malformed and invalid media requests cannot write services", async () => {
  const h = harness();
  h.state.allowed = false;
  await assert.rejects(h.actions.createServiceAction({}, h.form), /Forbidden/);
  h.state.allowed = true; h.state.missing = true;
  assert.match((await h.actions.createServiceAction({}, h.form)).error, /unavailable/);
  h.form.set("serviceMedia", "not-json");
  assert.match((await h.actions.createServiceAction({}, h.form)).error, /photos/);
  h.form.set("serviceMedia", JSON.stringify({ ...selection, rectangular: { ...selection.rectangular, framing: { ...centeredFraming, imageZoom: 5 } } }));
  assert.match((await h.actions.createServiceAction({}, h.form)).error, /framing/);
  assert.equal(h.writes.length, 0);
});

test("migration preserves the existing booking image and protects both new media references", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "MediaAsset" (id TEXT PRIMARY KEY); CREATE TABLE "Service" (id TEXT PRIMARY KEY, "imageUrl" TEXT, "imageFraming" JSONB); INSERT INTO "Service" VALUES (\'service\', \'/existing.jpg\', \'{"imageZoom":2}\');');
    await db.exec(readFileSync("prisma/migrations/20261021120000_service_media/migration.sql", "utf8"));
    const result = await db.query('SELECT "imageUrl", "imageFraming", "rectangularMediaAssetId" FROM "Service"');
    assert.deepEqual(result.rows, [{ imageUrl: "/existing.jpg", imageFraming: { imageZoom: 2 }, rectangularMediaAssetId: null }]);
    assert.equal(mediaReferenceCount({ clientFiles: 0, productMedia: 0, serviceCategories: 0, services: 0, rectangularServices: 1, galleryServices: 2, portfolioItems: 0, purchasedSelections: 0 }), 3);
    assert.deepEqual(unreferencedMediaWhere.rectangularServices, { none: {} });
    assert.deepEqual(unreferencedMediaWhere.galleryServices, { none: {} });
  } finally { await db.close(); }
});

test("public services retain the booking photo and expose named crops without publishing the extra gallery", () => {
  const require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/scheduling/pricing": { servicePriceCents },
    "@/modules/content/studio/image-framing": { readImageFraming },
    "@/lib/env": { publicAppBaseUrl: () => "https://example.test" },
    "@/lib/media": { mediaAssetDisplayUrl: (asset: { url: string }) => asset.url }
  };
  const source = ts.transpileModule(readFileSync("lib/embed/public-scheduling.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { serializePublicService?: (service: object) => { imageUrl: string; media: { square: { imageZoom: number }; rectangular: { url: string; aspectRatio: number; imageZoom: number } | null } } } = {};
  runInNewContext(source, { exports, URL, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") || id.startsWith("next/") ? {} : require(id) });
  const service = { id: "service", category: "", imageUrl: "", mediaAsset: { url: "/square.jpg" }, imageFraming: centeredFraming,
    rectangularMediaAsset: { url: "/rectangle.jpg", isPrivate: false, deletedAt: null }, rectangularImageFraming: { ...centeredFraming, imageZoom: 2 },
    galleryAssets: [{ url: "/future.jpg" }], staffAssignments: [], resourceAssignments: [] };
  const result = exports.serializePublicService!(service);
  assert.equal(result.imageUrl, "https://example.test/square.jpg");
  assert.equal(result.media.square.imageZoom, 1);
  assert.equal(result.media.rectangular?.aspectRatio, 4 / 3);
  assert.equal(result.media.rectangular?.imageZoom, 2);
  assert.equal(JSON.stringify(result).includes("future.jpg"), false);
  service.rectangularMediaAsset.isPrivate = true;
  assert.equal(exports.serializePublicService!(service).media.rectangular, null);
});
