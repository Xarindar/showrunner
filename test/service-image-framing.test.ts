import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { centeredFraming, imageFramingSchema } from "../modules/content/studio/image-framing";

test("booking crop saves require authorization, valid framing and the current tenant revision", async () => {
  let writes = 0, count = 1, authorized = true;
  const mocks: Record<string, unknown> = {
    "@/modules/content/studio/image-framing": { imageFramingSchema },
    "@/lib/scheduling/session-input": {}, "@/lib/scheduling/session-offering": {}, "@/lib/scheduling/service-library-store": {},
    "next/cache": { revalidatePath() {} }, "next/navigation": {},
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "scheduling:manage"); if (!authorized) throw Error("Forbidden"); } },
    "@/lib/admin-validation": { requiredText: z.string().min(1), optionalStoredText: z.string().optional() },
    "@/lib/media": {}, "@/lib/services/service-slugs": {}, "@/lib/slug": {}, "@/lib/timezone": {},
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/prisma": { prisma: { service: { updateMany: async (query: { where: { id: string; siteId: string; updatedAt: Date }; data: unknown }) => {
      writes++; assert.equal(query.where.siteId, "site-a"); assert.equal(query.where.id, "service-a");
      assert.equal(query.where.updatedAt.toISOString(), "2026-10-20T12:00:00.000Z");
      assert.equal(JSON.stringify(query.data), JSON.stringify({ imageFraming: centeredFraming })); return { count };
    } } } }
  };
  const require = createRequire(import.meta.url);
  const output = ts.transpileModule(readFileSync("modules/scheduling/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { saveServiceImageFramingAction?: (input: unknown) => Promise<{ error?: string; saved?: boolean }> } = {};
  runInNewContext(output, { exports, Date, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  const save = exports.saveServiceImageFramingAction!;
  const input = { id: "service-a", updatedAt: "2026-10-20T12:00:00.000Z", framing: centeredFraming };
  assert.equal((await save(input)).saved, true);
  assert.ok((await save({ ...input, framing: { ...centeredFraming, imageZoom: 4 } })).error); assert.equal(writes, 1);
  count = 0; assert.match((await save(input)).error || "", /changed/);
  authorized = false; await assert.rejects(() => save(input), /Forbidden/); assert.equal(writes, 2);
});
