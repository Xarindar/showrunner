import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { normalizeClientStatus } from "../lib/clients/status";
import { isRecord } from "../lib/objects";

function harness(serviceFound = true) {
  const writes: Array<Record<string, unknown>> = [];
  const serviceQueries: Array<Record<string, unknown>> = [];
  const input = { id: "client-a", status: "session_booked", serviceId: "portrait", tags: [], preferences: "New notes" };
  const existing = { id: "client-a", status: "session_booked", preferences: { serviceId: "portrait", otherSetting: "keep" }, policyAcceptanceHistory: [] };
  const db = {
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    client: {
      findFirst: async () => existing,
      findUnique: async () => null,
      create: async (query: Record<string, unknown>) => { writes.push(query); return { id: "client-a" }; },
      updateMany: async (query: Record<string, unknown>) => { writes.push(query); return { count: 1 }; }
    },
    service: { findFirst: async (query: Record<string, unknown>) => { serviceQueries.push(query); return serviceFound ? { id: "portrait" } : null; } },
    clientTag: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) }
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireAdmin: async () => ({ id: "admin" }), getAccessibleClientWhere: async (_user: unknown, siteId: string, where: object) => ({ siteId, ...where }) },
    "@/lib/admin-validation": { clientFormSchema: {}, clientUpdateFormSchema: {}, parseForm: async () => input },
    "@/lib/clients/configuration": { getClientStatusSettings: async () => ({ options: [{ value: "session_booked", label: "Session booked" }] }) },
    "@/lib/clients/status": { normalizeClientStatus }, "@/lib/objects": { isRecord },
    "@/lib/site": { getCurrentSiteId: async () => "site-a" }, "@/lib/prisma": { prisma: db },
    "@/lib/media": {}, "@/lib/slug": {}, "@/lib/audit": {},
    "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: () => { throw new Error("redirect"); } }
  };
  const exports: Record<string, (form: FormData) => Promise<void>> = {};
  const require = createRequire(import.meta.url);
  const source = ts.transpileModule(readFileSync(new URL("../modules/clients/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, require: (id: string) => id in mocks ? mocks[id] : require(id), Date, FormData, console });
  return { actions: exports, input, writes, serviceQueries };
}

test("client creation rejects disabled statuses and services outside the site catalog before writing", async () => {
  const invalidStatus = harness();
  invalidStatus.input.status = "active_order";
  await assert.rejects(invalidStatus.actions.createClientAction(new FormData()), /enabled client status/);
  assert.equal(invalidStatus.writes.length, 0);
  const invalidService = harness(false);
  await assert.rejects(invalidService.actions.createClientAction(new FormData()), /available service/);
  assert.equal(invalidService.writes.length, 0);
  assert.equal(JSON.stringify(invalidService.serviceQueries[0]), JSON.stringify({ where: { id: "portrait", siteId: "site-a", isActive: true }, select: { id: true } }));
});

test("editing preserves unrelated preferences and a retained inactive service", async () => {
  const app = harness();
  await assert.rejects(app.actions.updateClientAction(new FormData()), /redirect/);
  const data = app.writes[0].data as { preferences: Record<string, unknown> };
  assert.equal(data.preferences.otherSetting, "keep");
  assert.equal(data.preferences.notes, "New notes");
  assert.equal(data.preferences.serviceId, "portrait");
  assert.equal(JSON.stringify(app.serviceQueries[0]), JSON.stringify({ where: { id: "portrait", siteId: "site-a" }, select: { id: true } }));
});
