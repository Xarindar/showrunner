import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("image picker combines folder, tag and search within the authorized library", async () => {
  type Query = { where: { AND?: unknown[]; createdByUserId?: string; siteId?: string }; select: Record<string, boolean>; skip?: number };
  const calls: Record<string, Query> = {};
  const scope = { siteId: "site-a", createdByUserId: "owner-a", deletedAt: null, isPrivate: false, mimeType: { startsWith: "image/" } };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown) => body } },
    "@prisma/client": { MediaVariantType: {} },
    "@/lib/auth": { requireAuthenticatedAdmin: async () => ({ id: "owner-a" }), resolveDataScopeMode: async () => "OWN", getAccessibleMediaWhere: async () => scope },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/format": { nonEmptyStringArrayFromUnknown: (tags: unknown) => tags },
    "@/lib/media": { mediaAssetDisplayUrl: () => "/image" },
    "@/lib/media-tags": { summarizeMediaTags: () => [] },
    "@/lib/prisma": { prisma: {
      mediaFolder: { findMany: async (args: Query) => { calls.folders = args; return [{ name: "Empty folder" }]; } },
      mediaAsset: {
        groupBy: async (args: Query) => { calls.groups = args; return [{ folder: "Events" }]; },
        findMany: async (args: Query) => { if (args.select.tags && !args.select.id) return [{ tags: ["venue"] }]; calls.assets = args; return []; },
        count: async (args: Query) => { calls.count = args; return 0; }
      }
    } }
  };
  const require = createRequire(import.meta.url);
  const exports: Record<string, (request: unknown) => Promise<{ folders: string[] }>> = {};
  const code = ts.transpileModule(readFileSync("app/api/media/assets/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (id: string) => id in mocks ? mocks[id] : require(id), URL, Date });
  const response = await exports.GET({ nextUrl: new URL("https://example.test/api/media/assets?folder=Events&tag=venue&q=party&page=2") });
  assert.equal(calls.assets.where.AND![0], scope);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.assets.where.AND![1])), { folder: "Events" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.assets.where.AND![2])), { tags: { array_contains: ["venue"] } });
  assert.match(JSON.stringify(calls.assets.where.AND![3]), /"filename":\{"contains":"party"/);
  assert.equal(calls.assets.skip, 24);
  assert.equal(calls.groups.where, scope);
  assert.equal(calls.folders.where.createdByUserId, "owner-a");
  assert.equal(calls.folders.where.siteId, "site-a");
  assert.equal(response.folders.join(","), "Empty folder,Events");
});
