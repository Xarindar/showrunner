import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { normalizeMediaFolder, validMediaFolderPath } from "../lib/media-folders";

test("card actions preserve links and nested paths, enforce scope, reject collisions and migrate contents before deleting folders", async () => {
  type Row = Record<string, unknown>;
  let folders: Row[] = [
    { id: "root", siteId: "site", name: "Photos", createdByUserId: "owner" },
    { id: "child", siteId: "site", name: "Photos/Summer", createdByUserId: "owner" },
    { id: "destination", siteId: "site", name: "Events", createdByUserId: "owner" }
  ];
  let assets: Row[] = [{ id: "a", siteId: "site", uploadedByStaffId: "staff", folder: "Photos/Summer", filename: "a.jpg", url: "/original", key: "original", isPrivate: true, deletedAt: null }];
  function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => key === "AND" ? (value as Row[]).every(part => matches(row, part)) : key === "OR" ? (value as Row[]).some(part => matches(row, part)) : value && typeof value === "object" ? String(row[key]).startsWith((value as { startsWith: string }).startsWith) : row[key] === value);
  }
  function model(rows: () => Row[]) {
    return {
      findFirst: async ({ where }: { where: Row }) => rows().find(row => matches(row, where)) || null,
      findMany: async ({ where }: { where: Row }) => rows().filter(row => matches(row, where)).map(row => ({ ...row })),
      count: async ({ where }: { where: Row }) => rows().filter(row => matches(row, where)).length,
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(rows().find(row => matches(row, where))!, data),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { const found = rows().filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length }; },
      deleteMany: async ({ where }: { where: Row }) => { const current = rows(); for (let i = current.length - 1; i >= 0; i--) if (matches(current[i], where)) current.splice(i, 1); }
    };
  }
  const tx = { mediaFolder: model(() => folders), mediaAsset: model(() => assets) };
  let denied = false;
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": { optionalStoredText: z.string(), requiredText: z.string().min(1) },
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { assert.equal(permission, "media:manage"); if (denied) throw Error("Denied"); return { id: "owner" }; },
      resolveDataScopeMode: async () => "OWN",
      getAccessibleMediaWhere: async (_user: unknown, siteId: string, extra: Row) => ({ siteId, uploadedByStaffId: "staff", ...extra })
    },
    "@/lib/site": { getCurrentSiteId: async () => "site" },
    "@/lib/media": { normalizeMediaFolder }, "@/lib/media-folders": { validMediaFolderPath },
    "@/lib/prisma": { prisma: { ...tx, $transaction: async (fn: (value: typeof tx) => Promise<void>, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, "Serializable");
      const before = structuredClone({ folders, assets });
      try { await fn(tx); } catch (error) { folders = before.folders; assets = before.assets; throw error; }
    } } },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": {}, "@/modules/content/hero-presentation": {}, "@/lib/media-usage": {}
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (data: FormData) => Promise<{ error?: string; success?: boolean; needsDestination?: boolean }>> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../modules/media/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: actions, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const data = (values: Record<string, string>) => { const form = new FormData(); Object.entries(values).forEach(([key, value]) => form.set(key, value)); return form; };
  const change = (folder: string, operation: string, value = "") => actions.changeMediaFolder(data({ folder, operation, value }));
  assert.ok((await actions.renameMediaAsset(data({ id: "a", name: "../bad" }))).error);
  assert.ok((await actions.renameMediaAsset(data({ id: "foreign", name: "My Photo.jpg" }))).error);
  assert.equal((await actions.renameMediaAsset(data({ id: "a", name: "My Photo.jpg" }))).success, true);
  assert.equal(assets[0].filename, "My Photo.jpg");
  assert.equal((await change("Photos", "rename", "Family Photos")).success, true);
  assert.equal(assets[0].folder, "Family Photos/Summer");
  assert.equal(folders[1].name, "Family Photos/Summer");
  assert.ok((await change("Family Photos", "move", "Family Photos/Summer")).error);
  assert.ok((await change("Family Photos", "rename", "Events")).error);
  assert.equal((await change("Family Photos", "move", "Events")).success, true);
  assert.equal(assets[0].folder, "Events/Family Photos/Summer");
  assert.equal(assets[0].url, "/original"); assert.equal(assets[0].key, "original"); assert.equal(assets[0].isPrivate, true);
  assert.ok((await change("Events/Family Photos", "delete")).error);
  assets.push({ ...assets[0], id: "hidden", uploadedByStaffId: "someone-else" });
  assert.ok((await change("Events/Family Photos", "rename", "Blocked")).error);
  assert.equal(folders[0].name, "Events/Family Photos"); assets.pop();
  folders[1].createdByUserId = "someone-else";
  assert.ok((await change("Events/Family Photos", "rename", "Blocked")).error);
  folders[1].createdByUserId = "owner";
  assert.ok((await change("Events/Family Photos", "rename", "x".repeat(193))).error);
  assert.equal(folders[0].name, "Events/Family Photos");
  assets[0].deletedAt = new Date();
  assert.equal((await change("Events/Family Photos/Summer", "delete")).success, true);
  assert.equal(assets[0].folder, "Events/Family Photos");
  assert.equal((await change("Events/Family Photos", "delete")).success, true);
  assert.equal(assets[0].folder, "Events"); assert.equal(folders.length, 1);
  folders.push({id:"remove",siteId:"site",name:"Remove",createdByUserId:"owner"},{id:"nested",siteId:"site",name:"Remove/Nested",createdByUserId:"owner"});
  assets.push({...assets[0],id:"direct",folder:"Remove",deletedAt:null},{...assets[0],id:"nested-file",folder:"Remove/Nested",deletedAt:null});
  assert.equal((await change("Remove","delete")).needsDestination,true);
  const migrate = (folder: string, migrateTo: string) => actions.changeMediaFolder(data({folder,operation:"delete",value:"",migrateTo}));
  assert.ok((await migrate("Remove","Remove/Nested")).error);
  assert.ok((await migrate("Remove","Missing")).error);
  assert.equal((await migrate("Remove","Events")).success,true);
  assert.equal(assets.find(row=>row.id==="direct")!.folder,"Events");
  assert.equal(assets.find(row=>row.id==="nested-file")!.folder,"Events/Nested");
  assert.ok(folders.some(row=>row.name==="Events/Nested"));assert.ok(!folders.some(row=>row.name==="Remove"));
  assert.equal(assets.find(row=>row.id==="nested-file")!.url,"/original");
  folders.push({id:"collision",siteId:"site",name:"Collision",createdByUserId:"owner"},{id:"collision-child",siteId:"site",name:"Collision/Nested",createdByUserId:"owner"});
  assert.match((await migrate("Collision","Events")).error!,/same name/);
  assert.ok(folders.some(row=>row.name==="Collision/Nested"));
  assert.equal((await migrate("Collision","")).success,true);
  assert.ok(folders.some(row=>row.name==="Nested"));
  assert.equal((await migrate("Events/Nested","")).success,true);
  assert.equal(assets.find(row=>row.id==="nested-file")!.folder,"");
  denied = true;
  await assert.rejects(change("Events", "delete"), /Denied/);
  await assert.rejects(actions.renameMediaAsset(data({ id: "a", name: "Changed" })), /Denied/);
});

