import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

function harness({ own = false, linked = true, denied = false, fail = false } = {}) {
  const writes: Array<{ file: File; metadata: Record<string, unknown>; driver: string; siteId: string }> = [];
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": { optionalStoredText: z.string().trim(), requiredText: z.string().min(1) },
    "@/lib/auth": {
      requireAdmin: async (permission: string) => { assert.equal(permission, "media:manage"); if (denied) throw new Error("Denied"); return { id: "admin-a" }; },
      getOwnerStaffIds: async () => linked ? ["staff-a"] : [], resolveDataScopeMode: async () => own ? "OWN" : "ALL"
    },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a", mediaDriver: "SERVER_ASSETS" }) },
    "@/lib/media": {
      normalizeMediaFolder: (value: string) => value, mediaTagsFromInput: (value: string) => value.split(",").filter(Boolean), mediaAssetDisplayUrl: () => "/image",
      uploadMedia: async (file: File, metadata: Record<string, unknown>, driver: string, siteId: string) => {
        if (fail) throw new Error("Storage unavailable");
        writes.push({ file, metadata, driver, siteId });
        return { id: "asset-a", filename: file.name, alt: metadata.alt, createdAt: new Date(), folder: metadata.folder };
      }
    },
    "next/cache": { revalidatePath: () => {} }, "next/navigation": {},
    "@/modules/content/hero-presentation": {}, "@/lib/media-usage": {}, "@/lib/prisma": {}
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (form: FormData) => Promise<{ error?: string; asset?: { id: string } }>> = {};
  const source = ts.transpileModule(readFileSync(new URL("../modules/media/actions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, { exports: actions, require: (id: string) => id in mocks ? mocks[id] : require(id), File, FormData, Error, console });
  const data = new FormData(); data.set("file", new File(["image"], "venue.png", { type: "image/png" })); data.set("alt", "Venue at sunset");
  return { upload: actions.uploadLibraryAsset, data, writes };
}

test("library uploads require permission, a linked owner when scoped, a file and accessible metadata", async () => {
  const denied = harness({ denied: true }); await assert.rejects(denied.upload(denied.data), /Denied/);
  const scoped = harness({ own: true, linked: false }); assert.match((await scoped.upload(scoped.data)).error!, /staff profile/); assert.equal(scoped.writes.length, 0);
  const missing = harness(); missing.data.delete("file"); assert.match((await missing.upload(missing.data)).error!, /Choose an image/);
  const alt = harness(); alt.data.set("alt", ""); assert.match((await alt.upload(alt.data)).error!, /alt text/); assert.equal(alt.writes.length, 0);
});

test("library uploads preserve privacy and ownership and use the authenticated site", async () => {
  const app = harness({ own: true }); app.data.set("isPrivate", "on"); app.data.set("siteId", "foreign-site");
  assert.equal((await app.upload(app.data)).asset?.id, "asset-a");
  assert.equal(app.writes[0].siteId, "site-a"); assert.equal(app.writes[0].metadata.uploadedByStaffId, "staff-a"); assert.equal(app.writes[0].metadata.isPrivate, true);
  const failed = harness({ fail: true }); assert.equal((await failed.upload(failed.data)).error, "Storage unavailable");
});

 test("library video uploads use a filename description without bypassing permissions", async () => {
  const h = harness(); h.data.set("file", new File(["video"], "tour.mp4", { type: "video/mp4" })); h.data.set("alt", "");
  assert.ok((await h.upload(h.data)).asset); assert.equal(h.writes[0].metadata.alt,"tour.mp4");
});
