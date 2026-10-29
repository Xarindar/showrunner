import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { normalizeMediaFolder, validMediaFolderPath, childMediaFolders } from "../lib/media-folders";

test("folder creation and batch moves preserve names, scope, metadata and atomicity", async () => {
  let denied = false, folderExists = true, legacyExists = false, duplicate = false;
  const folders: unknown[] = [];
  const assets = [{ id: "a", folder: "Original", private: true }, { id: "b", folder: "Original", private: false }];
  const access = { siteId: "site-a", uploadedByStaffId: "staff-a", deletedAt: null };
  const mediaAsset = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      assert.equal(where.siteId, "site-a"); assert.equal(where.uploadedByStaffId, "staff-a"); return legacyExists ? { id: "legacy" } : null;
    },
    updateMany: async ({ where, data }: { where: { AND: [unknown, { id: { in: string[] } }] }; data: { folder: string } }) => {
      assert.equal(JSON.stringify(where.AND[0]), JSON.stringify(access));
      assert.deepEqual(Object.keys(data), ["folder"]);
      const matches = assets.filter(asset => where.AND[1].id.in.includes(asset.id));
      matches.forEach(asset => { asset.folder = data.folder; }); return { count: matches.length };
    }
  };
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": { optionalStoredText: z.string().trim(), requiredText: z.string().trim().min(1) },
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { assert.equal(permission, "media:manage"); if (denied) throw Error("Denied"); return { id: "user-a" }; },
      resolveDataScopeMode: async () => "OWN",
      getAccessibleMediaWhere: async (_user: unknown, siteId: string, extra: object) => { assert.equal(siteId, "site-a"); return { ...access, ...extra }; }
    },
    "@/lib/site": { getCurrentSiteId: async () => "site-a" },
    "@/lib/media": { normalizeMediaFolder }, "@/lib/media-folders": { validMediaFolderPath },
    "@/lib/prisma": { prisma: {
      mediaFolder: {
        create: async ({ data }: { data: unknown }) => { if (duplicate) throw { code: "P2002" }; folders.push(data); },
        findFirst: async ({ where }: { where: Record<string, unknown> }) => { assert.equal(where.siteId, "site-a"); assert.equal(where.createdByUserId, "user-a"); return folderExists ? { id: "folder" } : null; }
      }, mediaAsset,
      $transaction: async (callback: (tx: { mediaAsset: typeof mediaAsset }) => Promise<void>) => {
        const before = assets.map(asset => ({ ...asset }));
        try { await callback({ mediaAsset }); } catch (error) { assets.splice(0, assets.length, ...before); throw error; }
      }
    } },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": {}, "@/modules/content/hero-presentation": {}, "@/lib/media-usage": {}
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (data: FormData) => Promise<{ error?: string; name?: string; success?: boolean }>> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../modules/media/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: actions, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const data = new FormData();
  for (const name of [" ", "x".repeat(201), "../Other", "..", "bad\\name"]) { data.set("name", name); assert.ok((await actions.createMediaFolder(data)).error); }
  assert.equal(folders.length, 0);
  data.set("name", " Summer Events "); data.set("siteId", "foreign"); data.set("createdByUserId", "foreign");
  assert.equal((await actions.createMediaFolder(data)).name, "Summer Events");
  assert.equal(JSON.stringify(folders[0]), JSON.stringify({ siteId: "site-a", name: "Summer Events", createdByUserId: "user-a" }));
  data.set("parent", "Family Photos"); assert.equal((await actions.createMediaFolder(data)).name, "Family Photos/Summer Events");
  folderExists = false; assert.match((await actions.createMediaFolder(data)).error!, /Parent folder not found/);
  legacyExists = true; assert.equal((await actions.createMediaFolder(data)).name, "Family Photos/Summer Events");
  data.set("parent", "x".repeat(195)); assert.ok((await actions.createMediaFolder(data)).error);
  data.set("parent", ""); duplicate = true; assert.match((await actions.createMediaFolder(data)).error!, /already exists/);
  const move = new FormData(); assert.ok((await actions.moveMediaAssetToFolder(move)).error);
  move.append("id", "a"); move.append("id", "b"); move.append("id", "a"); move.set("folder", " Summer Events "); move.set("isPrivate", "false");
  assert.equal((await actions.moveMediaAssetToFolder(move)).success, true);
  assert.deepEqual(assets.map(asset => [asset.folder, asset.private]), [["Summer Events", true], ["Summer Events", false]]);
  move.append("id", "foreign"); move.set("folder", "Other"); assert.ok((await actions.moveMediaAssetToFolder(move)).error);
  assert.equal(assets[0].folder, "Summer Events"); assert.equal(assets[1].folder, "Summer Events");
  move.delete("id"); move.append("id", "a"); legacyExists = false;
  assert.match((await actions.moveMediaAssetToFolder(move)).error!, /Folder not found/);
  move.set("folder", ""); assert.equal((await actions.moveMediaAssetToFolder(move)).success, true); assert.equal(assets[0].folder, "");
  denied = true; await assert.rejects(actions.createMediaFolder(data), /Denied/); await assert.rejects(actions.moveMediaAssetToFolder(move), /Denied/);
});

test("folder trees include implicit parents, direct children and unlimited path depth", () => {
  assert.equal(normalizeMediaFolder(" Family Photos / Summer Events / A/B/C "), "Family Photos/Summer Events/A/B/C");
  const folders = [{ name: "Family Photos/Summer Events", count: 2 }, { name: "Family Photos/Winter", count: 3 }, { name: "Family Photos/Summer Events/Empty", count: 0 }, { name: "Family Photos Extra", count: 1 }];
  assert.deepEqual(childMediaFolders(folders, ""), [{ name: "Family Photos", label: "Family Photos", count: 5 }, { name: "Family Photos Extra", label: "Family Photos Extra", count: 1 }]);
  assert.deepEqual(childMediaFolders(folders, "Family Photos").map(folder => folder.label), ["Summer Events", "Winter"]);
  assert.deepEqual(childMediaFolders(folders, "Family Photos/Summer Events"), [{ name: "Family Photos/Summer Events/Empty", label: "Empty", count: 0 }]);
});
