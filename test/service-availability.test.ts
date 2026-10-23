import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness() {
  const require = createRequire(import.meta.url);
  const validation = {};
  const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
  runInNewContext(ts.transpileModule(readFileSync("lib/admin-validation.ts", "utf8"), { compilerOptions }).outputText, {
    exports: validation, require: (id: string) => id === "server-only" ? {} : require(id)
  });
  const writes: Array<{ data?: Record<string, unknown>; where?: Record<string, unknown> }> = [];
  const refreshed: string[] = [];
  const state = { allowed: true, ownerExists: true };
  const owner = { findFirst: async (query: { where: Record<string, unknown> }) => {
    assert.equal(query.where.siteId, "site");
    assert.equal(query.where.isActive, true);
    return state.ownerExists ? { id: query.where.id } : null;
  } };
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": validation,
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "scheduling:manage"); if (!state.allowed) throw Error("Forbidden"); } },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site" }) },
    "@/lib/prisma": { prisma: { staffMember: owner, resource: owner, availabilityRule: {
      create: async (query: typeof writes[number]) => writes.push(query),
      deleteMany: async (query: typeof writes[number]) => writes.push(query)
    } } },
    "next/cache": { revalidatePath: (path: string) => refreshed.push(path) },
    "next/navigation": { redirect: () => { throw Error("Unexpected navigation"); } }
  };
  const actions: Record<string, (...args: unknown[]) => Promise<{ error: string; success: string }>> = {};
  const source = ts.transpileModule(readFileSync("modules/scheduling/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports: actions, Error, Date, URLSearchParams, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id) });
  const form = new FormData();
  form.set("weekday", "3"); form.set("startTime", "10:15"); form.set("endTime", "11:15");
  return { actions, writes, refreshed, state, form };
}

test("availability saves in place and refreshes service hours; deletion stays site scoped", async () => {
  const h = harness();
  const result = await h.actions.createAvailabilityAction({}, h.form);
  assert.equal(result.error, "");
  assert.equal(result.success, "Availability added.");
  assert.equal(h.writes[0].data?.siteId, "site");
  assert.equal(h.writes[0].data?.startMinutes, 615);
  assert.ok(h.refreshed.includes("/admin/modules/services/[serviceId]"));
  h.form.set("id", "rule");
  await h.actions.deleteAvailabilityAction(h.form);
  assert.equal(h.writes[1].where?.siteId, "site");
  assert.equal(h.writes[1].where?.id, "rule");
});

test("invalid hours and unavailable owners return errors without writes or navigation", async () => {
  const h = harness();
  h.form.set("endTime", "09:00");
  assert.match((await h.actions.createAvailabilityAction({}, h.form)).error, /end after/);
  h.form.set("endTime", "11:15"); h.form.set("staffId", "staff"); h.form.set("resourceId", "resource");
  assert.match((await h.actions.createAvailabilityAction({}, h.form)).error, /not both/);
  h.form.delete("resourceId"); h.state.ownerExists = false;
  assert.match((await h.actions.createAvailabilityAction({}, h.form)).error, /active staff/);
  h.form.delete("staffId"); h.form.set("resourceId", "resource");
  assert.match((await h.actions.createAvailabilityAction({}, h.form)).error, /active resource/);
  assert.equal(h.writes.length, 0);
});

test("availability mutations require scheduling permission", async () => {
  const h = harness(); h.state.allowed = false;
  await assert.rejects(h.actions.createAvailabilityAction({}, h.form), /Forbidden/);
  await assert.rejects(h.actions.deleteAvailabilityAction(h.form), /Forbidden/);
  assert.equal(h.writes.length, 0);
});
