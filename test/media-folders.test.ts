import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

test("folder creation validates names, uses authenticated ownership and handles duplicates", async () => {
  const writes: unknown[] = [];
  let denied = false, duplicate = false;
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": { optionalStoredText: z.string().trim(), requiredText: z.string().min(1) },
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "media:manage"); if (denied) throw Error("Denied"); return { id: "user-a" }; } },
    "@/lib/site": { getCurrentSiteId: async () => "site-a" },
    "@/lib/media": { normalizeMediaFolder: (name: string) => name.trim().toLowerCase() },
    "@/lib/prisma": { prisma: { mediaFolder: { create: async ({ data }: { data: unknown }) => { if (duplicate) throw { code: "P2002" }; writes.push(data); } } } },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": {}, "@/modules/content/hero-presentation": {}, "@/lib/media-usage": {}
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (data: FormData) => Promise<{ error?: string; name?: string }>> = {};
  const source = ts.transpileModule(readFileSync(new URL("../modules/media/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports: actions, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const data = new FormData(); data.set("name", " ");
  assert.ok((await actions.createMediaFolder(data)).error); assert.equal(writes.length, 0);
  data.set("name", "x".repeat(201)); assert.ok((await actions.createMediaFolder(data)).error);
  data.set("name", " Events "); data.set("siteId", "foreign"); data.set("createdByUserId", "foreign");
  assert.equal((await actions.createMediaFolder(data)).name, "events");
  assert.equal(JSON.stringify(writes[0]), JSON.stringify({ siteId: "site-a", name: "events", createdByUserId: "user-a" }));
  duplicate = true; assert.match((await actions.createMediaFolder(data)).error!, /already exists/);
  denied = true; await assert.rejects(actions.createMediaFolder(data), /Denied/);
});

test("moving media changes only its folder and enforces asset and folder access", async () => {
  const writes: { where: unknown; data: unknown }[] = [];
  let denied = false, savedFolder = true, legacyFolder = false, count = 1, fail = false;
  const access = { siteId: "site-a", uploadedByStaffId: "staff-a", deletedAt: null };
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": { optionalStoredText: z.string().trim(), requiredText: z.string().min(1) },
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { assert.equal(permission, "media:manage"); if (denied) throw Error("Denied"); return { id: "user-a" }; },
      resolveDataScopeMode: async () => "OWN",
      getAccessibleMediaWhere: async (_user: unknown, siteId: string, filter: unknown) => {
        assert.equal(siteId, "site-a"); assert.equal(JSON.stringify(filter), '{"deletedAt":null}'); return access;
      }
    },
    "@/lib/site": { getCurrentSiteId: async () => "site-a" },
    "@/lib/media": { normalizeMediaFolder: (name: string) => name.trim().toLowerCase() },
    "@/lib/prisma": { prisma: {
      mediaFolder: { findFirst: async ({ where }: { where: unknown }) => {
        assert.equal(JSON.stringify(where), JSON.stringify({ siteId: "site-a", name: "events", createdByUserId: "user-a" }));
        return savedFolder ? { id: "folder-a" } : null;
      } },
      mediaAsset: {
        findFirst: async ({ where }: { where: unknown }) => {
          assert.equal(JSON.stringify(where), JSON.stringify({ AND: [access, { folder: "events" }] }));
          return legacyFolder ? { id: "legacy" } : null;
        },
        updateMany: async (args: { where: unknown; data: unknown }) => { if (fail) throw Error("offline"); writes.push(args); return { count }; }
      }
    } },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": {}, "@/modules/content/hero-presentation": {}, "@/lib/media-usage": {}
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (data: FormData) => Promise<{ error?: string; success?: boolean }>> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../modules/media/actions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText, { exports: actions, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const data = new FormData();
  assert.ok((await actions.moveMediaAssetToFolder(data)).error); assert.equal(writes.length, 0);
  data.set("id", "asset-a"); data.set("folder", " Events "); data.set("isPrivate", "false");
  assert.equal((await actions.moveMediaAssetToFolder(data)).success, true);
  assert.equal(JSON.stringify(writes[0]), JSON.stringify({ where: { AND: [access, { id: "asset-a" }] }, data: { folder: "events" } }));
  savedFolder = false;
  assert.match((await actions.moveMediaAssetToFolder(data)).error!, /Folder not found/); assert.equal(writes.length, 1);
  legacyFolder = true;
  assert.equal((await actions.moveMediaAssetToFolder(data)).success, true);
  count = 0; assert.match((await actions.moveMediaAssetToFolder(data)).error!, /File not found/);
  fail = true; assert.match((await actions.moveMediaAssetToFolder(data)).error!, /could not be moved/);
  denied = true; await assert.rejects(actions.moveMediaAssetToFolder(data), /Denied/);
});
