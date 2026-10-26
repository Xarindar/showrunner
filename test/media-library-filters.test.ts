import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("media opens the full library and preserves bookmarked categories and filters", () => {
  const source = readFileSync(new URL("../modules/media/page.tsx", import.meta.url), "utf8");
  const exports: { filtersFromParams?: (params: Record<string, string>) => Record<string, unknown> } = {};
  runInNewContext(ts.transpileModule(`${source}\nexport { filtersFromParams };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require: () => ({}) });
  const filters = exports.filtersFromParams!;
  assert.equal(filters({}).scope, "all");
  assert.equal(filters({ scope: "home", page: "2" }).scope, "all");
  assert.equal(filters({ scope: "unknown" }).scope, "all");
  const bookmarked = filters({ scope: "private", tag: " Venue ", q: " Garden ", page: "2", sort: "name" });
  assert.equal(bookmarked.scope, "private");
  assert.equal(bookmarked.tag, "Venue");
  assert.equal(bookmarked.q, "Garden");
  assert.equal(bookmarked.page, 2);
  assert.equal(bookmarked.sort, "name");
  assert.equal(filters({ page: "-1", kind: "script" }).page, 1);
  assert.equal(filters({ kind: "script" }).kind, "all");
});

test("home shows unfiled media, nested views use the full path, and search still spans folders", async () => {
  const queries: unknown[] = [];
  const mocks: Record<string, unknown> = {
    "react/jsx-runtime": { jsx: (_type: unknown, props: unknown) => props },
    "@/lib/auth": { requireAdmin: async () => ({}), resolveDataScopeMode: async () => "ALL", getAccessibleMediaWhere: async (_user: unknown, _site: string, extra: object) => ({ siteId: "site-a", ...extra }) },
    "@/lib/global-media-assets": { globalMediaAssets: [] },
    "@/lib/media": { isMediaUploadDriverConfigured: () => true, mediaAssetIdFromUrl: () => "" },
    "@/lib/media-tags": { summarizeMediaTags: () => [] },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/prisma": { prisma: { mediaFolder: { findMany: async () => [] }, mediaAsset: {
      count: async ({ where }: { where: unknown }) => { queries.push(where); return 0; }, groupBy: async () => [], findMany: async () => []
    } } }
  };
  const exports: { default?: (props: { searchParams: Promise<Record<string, string | undefined>> }) => Promise<unknown> } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../modules/media/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require: (id: string) => mocks[id] || {} });
  for (const [params, expected] of [[{}, '"folder":""'], [{ folder: "Family Photos/Summer" }, '"folder":"Family Photos/Summer"'], [{ q: "Garden" }, null]] as const) {
    queries.length = 0;
    await exports.default!({ searchParams: Promise.resolve(params) });
    const visible = JSON.stringify(queries.at(-1));
    if (expected) assert(visible.includes(expected));
    else { assert(!visible.includes('"folder":""')); assert(visible.includes('"contains":"Garden"')); }
  }
});
