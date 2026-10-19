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
