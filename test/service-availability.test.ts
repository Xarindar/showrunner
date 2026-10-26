import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hoursRevision, weeklyHoursSchema } from "../lib/scheduling/weekly-hours";

function harness() {
  const require = createRequire(import.meta.url);
  const validation = {};
  const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
  runInNewContext(ts.transpileModule(readFileSync("lib/admin-validation.ts", "utf8"), { compilerOptions }).outputText, {
    exports: validation, require: (id: string) => id === "server-only" ? {} : require(id)
  });
  const writes: Array<{ data?: Record<string, unknown>; where?: Record<string, unknown> }> = [];
  const refreshed: string[] = [];
  const state = { allowed: true, ownerExists: true, current: [] as Array<{ id: string; weekday: number; startMinutes: number; endMinutes: number }> };
  const owner = { findFirst: async (query: { where: Record<string, unknown> }) => {
    assert.equal(query.where.siteId, "site");
    assert.equal(query.where.isActive, true);
    return state.ownerExists ? { id: query.where.id } : null;
  } };
  const mocks: Record<string, unknown> = {
    "@/lib/admin-validation": validation,
    "@/lib/scheduling/weekly-hours": { hoursRevision, weeklyHoursSchema },
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "scheduling:manage"); if (!state.allowed) throw Error("Forbidden"); } },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site" }) },
    "@/lib/prisma": { prisma: { $transaction: async (callback: (tx: unknown) => Promise<void>, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, "Serializable");
      await callback({ availabilityRule: {
        findMany: async (query: { where: { siteId: string } }) => { assert.equal(query.where.siteId, "site"); return state.current; },
        deleteMany: async (query: typeof writes[number]) => writes.push(query),
        createMany: async (query: typeof writes[number]) => writes.push(query)
      } });
    }, staffMember: { ...owner, create: async (query: typeof writes[number]) => writes.push(query), updateMany: async (query: typeof writes[number]) => writes.push(query) }, resource: owner, availabilityRule: {
      create: async (query: typeof writes[number]) => writes.push(query),
      deleteMany: async (query: typeof writes[number]) => writes.push(query)
    } } },
    "next/cache": { revalidatePath: (path: string) => refreshed.push(path) },
    "next/navigation": { redirect: (path: string) => { throw Error(`Redirect:${path}`); } }
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

function weeklyForm(revision = "[]", ranges = [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }]) {
  const form = new FormData();
  form.set("hours", JSON.stringify({ staffId: "", resourceId: "", days: [1, 2], ranges, revision }));
  return form;
}

test("weekly hours replace only selected days and owner, preserving split shifts", async () => {
  const h = harness();
  assert.equal((await h.actions.saveWeeklyHoursAction({}, weeklyForm())).error, "");
  assert.equal(h.writes[0].where?.siteId, "site");
  assert.equal(h.writes[0].where?.staffId, null);
  assert.equal(h.writes[0].where?.resourceId, null);
  assert.equal(JSON.stringify(h.writes[0].where?.weekday), '{"in":[1,2]}');
  const data = h.writes[1].data as unknown as Array<{ weekday: number; startMinutes: number; endMinutes: number }>;
  assert.equal(data.length, 4);
  assert.equal(data[1].startMinutes, 780);
  assert.ok(h.refreshed.includes("/admin/modules/appointments/schedule"));
  assert.ok(h.refreshed.includes("/admin/modules/appointments/staff"));
});

test("weekly closure removes selected hours without creating a replacement", async () => {
  const h = harness();
  assert.equal((await h.actions.saveWeeklyHoursAction({}, weeklyForm("[]", []))).error, "");
  assert.equal(h.writes.length, 1);
});

test("stale weekly hours, overlaps, invalid times and forbidden users cannot write", async () => {
  const h = harness();
  h.state.current = [{ id: "changed", weekday: 1, startMinutes: 540, endMinutes: 600 }];
  assert.match((await h.actions.saveWeeklyHoursAction({}, weeklyForm())).error, /another session/);
  assert.match((await h.actions.saveWeeklyHoursAction({}, weeklyForm("[]", [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }]))).error, /overlap/);
  assert.ok((await h.actions.saveWeeklyHoursAction({}, weeklyForm("[]", [{ start: "25:00", end: "26:00" }]))).error);
  h.state.allowed = false;
  await assert.rejects(h.actions.saveWeeklyHoursAction({}, weeklyForm()), /Forbidden/);
  assert.equal(h.writes.length, 0);
});


test("staff weekly hours keep the employee scope and refresh Staff", async () => {
  const h = harness();
  const form = weeklyForm();
  const hours = JSON.parse(String(form.get("hours")));
  form.set("hours", JSON.stringify({ ...hours, staffId: "employee" }));
  assert.equal((await h.actions.saveWeeklyHoursAction({}, form)).error, "");
  assert.equal(h.writes[0].where?.staffId, "employee");
  assert.equal(h.writes[0].where?.resourceId, null);
  assert.ok(h.refreshed.includes("/admin/modules/appointments/staff"));
});


test("staff profile saves and validation return to Staff, with site-scoped writes", async () => {
  const h = harness();
  const form = new FormData();
  form.set("name", "Alex");
  form.set("isActive", "on");
  await assert.rejects(h.actions.createStaffMemberAction(form), /Redirect:\/admin\/modules\/appointments\/staff\?saved=staff/);
  assert.equal(h.writes[0].data?.siteId, "site");
  form.set("id", "employee");
  await assert.rejects(h.actions.updateStaffMemberAction(form), /Redirect:\/admin\/modules\/appointments\/staff\?saved=staff/);
  assert.equal(h.writes[1].where?.siteId, "site");
  assert.equal(h.writes[1].where?.id, "employee");
  form.set("email", "invalid");
  await assert.rejects(h.actions.createStaffMemberAction(form), /Redirect:\/admin\/modules\/appointments\/staff\?error=/);
  assert.equal(h.writes.length, 2);
});
