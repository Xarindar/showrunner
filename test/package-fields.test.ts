import assert from "node:assert/strict";
import test from "node:test";
import { readPackageFields, packageFieldsSchema, packageFieldNames } from "../lib/scheduling/package-fields";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as bookingRules from "../lib/scheduling/booking-rules";
import * as sessionInput from "../lib/scheduling/session-input";

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const exports = {}, require = createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: (id: string) => id in mocks ? mocks[id] : id === "server-only" || id.startsWith("@/") || id === "next/cache" ? {} : require(id) });
  return exports as T;
}

test("sites retain existing fields by default and may explicitly hide all or select a subset", () => {
  for (const settings of [undefined, null, {}, { unrelated: true }]) assert.deepEqual(readPackageFields(settings), packageFieldNames);
  assert.deepEqual(readPackageFields({ packageFields: [] }), []);
  assert.deepEqual(readPackageFields({ packageFields: ["finalPhotos"] }), ["finalPhotos"]);
  assert.deepEqual(readPackageFields({ packageFields: ["locations", "locations"] }), ["locations"]);
  assert.equal(packageFieldsSchema.safeParse(["foreignField"]).success, false);
  assert.deepEqual(readPackageFields({ packageFields: "finalPhotos" }), packageFieldNames);
});

test("package field configuration is read only from the requested site's scheduling installation", async () => {
  const store = load<typeof import("../lib/scheduling/package-fields-store")>("lib/scheduling/package-fields-store.ts", {
    "./package-fields": { readPackageFields },
    "@/lib/prisma": { prisma: { moduleInstallation: { findUnique: async ({ where }: { where: { siteId_moduleId: { siteId: string; moduleId: string } } }) => {
      assert.equal(where.siteId_moduleId.moduleId, "scheduling");
      return { settings: { packageFields: where.siteId_moduleId.siteId === "cottage" ? [] : ["finalPhotos"] } };
    } } } }
  });
  assert.deepEqual(await store.getPackageFields("cottage"), []);
  assert.deepEqual(await store.getPackageFields("jazzr"), ["finalPhotos"]);
});

test("the public catalog exposes its site's package field list even with no services", async () => {
  const api = load<typeof import("../lib/embed/public-scheduling")>("lib/embed/public-scheduling.ts", {
    "@/lib/scheduling/booking-rules": bookingRules,
    "@/lib/scheduling/session-input": sessionInput,
    "@/lib/scheduling/package-fields-store": { getPackageFields: async (siteId: string) => { assert.equal(siteId, "cottage"); return []; } },
    "@/lib/scheduling/booking-document-store": { listBookingDocuments: async () => [] },
    "@/lib/scheduling/native": { nativeSchedulingAdapter: { listActiveServices: async () => [] } },
    "@/lib/prisma": { prisma: { serviceCategory: { findMany: async () => [] }, hourlyRate: { findMany: async () => [] } } }
  });
  assert.deepEqual(Array.from((await api.listPublicSchedulingCatalog("cottage")).packageFields), []);
});
