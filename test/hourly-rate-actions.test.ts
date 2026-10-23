import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hourlyPriceCents, hourlyRateInputSchema } from "../lib/scheduling/pricing";
import { readSessionOffering } from "../lib/scheduling/session-offering";
import { serviceLibraryInputSchema, serviceLibraryItemSchema } from "../lib/scheduling/service-library";

test("rates and included services validate permissions and business scope before writing", async () => {
  let allowed = true;
  let rateAvailable = true;
  const writes: Array<{ where?: { siteId: string }; data: { siteId?: string; amountCents?: number } }> = [];
  const require = createRequire(import.meta.url);
  const db = {
    service: { findMany: async ({ where }: { where: { siteId: string } }) => { assert.equal(where.siteId, "site-a"); return [{ durationMinutes: 90, sessionOffering: null }]; } },
    hourlyRate: {
      findFirst: async ({ where }: { where: { id: string; siteId: string } }) => { assert.equal(where.siteId, "site-a"); return rateAvailable ? { id: where.id } : null; },
      update: async (query: typeof writes[number]) => { writes.push(query); return { id: "rate", name: "Standard", ...query.data }; },
      create: async (query: typeof writes[number]) => { writes.push(query); return { id: "rate", name: "Standard", ...query.data }; }
    },
    serviceLibraryItem: { create: async ({ data }: { data: object }) => { writes.push({ data }); return { id: "item", ...data }; } }
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "scheduling:manage"); if (!allowed) throw new Error("Forbidden"); } },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/prisma": { prisma: db },
    "@/lib/scheduling/pricing": { hourlyRateInputSchema, hourlyPriceCents },
    "@/lib/scheduling/session-offering": { readSessionOffering },
    "@/lib/scheduling/service-library": { serviceLibraryInputSchema, serviceLibraryItemSchema },
    "next/cache": { revalidatePath: () => {} }
  };
  function load(path: string) {
    const exports: Record<string, (input: unknown) => Promise<{ error?: string }>> = {};
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: (id: string) => mocks[id] ?? require(id) });
    return exports;
  }
  const rates = load("modules/scheduling/rate-actions.ts");
  const library = load("modules/scheduling/service-library-actions.ts");
  await rates.saveHourlyRateAction({ id: "rate", name: "Standard", amount: "125.50" });
  assert.equal(writes[0].where?.siteId, "site-a");
  assert.equal(writes[0].data.amountCents, 12550);
  assert.match((await rates.saveHourlyRateAction({ id: "rate", name: "Standard", amount: "9999999.99" })).error!, /existing package/);
  assert.equal(writes.length, 1);
  const item = { name: "Coverage", description: "", category: "", tags: "", pricingType: "HOURLY", hourlyRateId: "foreign-rate" };
  rateAvailable = false;
  assert.match((await library.saveServiceLibraryItemAction(item)).error!, /from this business/);
  assert.equal(writes.length, 1);
  allowed = false;
  await assert.rejects(rates.saveHourlyRateAction({ name: "Standard", amount: "1" }), /Forbidden/);
  await assert.rejects(library.saveServiceLibraryItemAction(item), /Forbidden/);
  assert.equal(writes.length, 1);
});
