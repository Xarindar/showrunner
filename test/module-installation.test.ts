import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Row = { siteId: string; moduleId: string; enabled: boolean };
type Query = { where: { siteId: string; moduleId?: { in: string[] } }; data?: { enabled: boolean } };
const moduleIds = ["dashboard", "content", "media"];
const normalizeModules = (ids: string[]) => [...new Set(["dashboard", ...ids.filter(id => moduleIds.includes(id))])];

function load<T>(file: string, mocks: Record<string, unknown>): T {
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, console, FormData, Set, Error, require: (id: string) => mocks[id] ?? {} });
  return exports as T;
}

function harness(initial: Row[] = []) {
  let rows = initial.map(row => ({ ...row }));
  let settings = { themePreset: "before" };
  let failRead = false;
  let failWrite = false;
  let concurrentInsert: Row | undefined;
  let writes = 0;
  const effects: string[] = [];
  const moduleInstallation = {
    findMany: async ({ where }: Query) => {
      if (failRead) throw new Error("database unavailable");
      return rows.filter(row => row.siteId === where.siteId).map(row => ({ ...row }));
    },
    createMany: async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates: boolean }) => {
      assert.equal(skipDuplicates, true);
      writes += 1;
      if (failWrite) throw new Error("module write failed");
      if (concurrentInsert) { rows.push(concurrentInsert); concurrentInsert = undefined; }
      for (const row of data) if (!rows.some(existing => existing.siteId === row.siteId && existing.moduleId === row.moduleId)) rows.push({ ...row });
    },
    updateMany: async ({ where, data }: Query) => {
      writes += 1;
      if (failWrite) throw new Error("module write failed");
      for (const row of rows) if (row.siteId === where.siteId && where.moduleId!.in.includes(row.moduleId)) row.enabled = data!.enabled;
    }
  };
  const tx = { moduleInstallation, siteSettings: { upsert: async ({ update }: { update: typeof settings }) => { settings = update; } } };
  const prisma = {
    moduleInstallation,
    $transaction: async (work: (db: typeof tx) => Promise<void>) => {
      const beforeRows = rows.map(row => ({ ...row }));
      const beforeSettings = settings;
      try { await work(tx); } catch (error) { rows = beforeRows; settings = beforeSettings; throw error; }
    }
  };
  const modules = { moduleRegistry: moduleIds.map(id => ({ id })), defaultEnabledModules: ["dashboard", "content"], normalizeModules };
  const installation = load<{
    resolveEnabledModuleIds: (initial: string[], siteId: string) => Promise<string[]>;
    setModuleEnablement: (db: typeof tx, enabled: string[], siteId: string) => Promise<void>;
  }>("lib/modules/installation.ts", { "@/lib/prisma": { prisma }, "@/shell/modules": modules });
  const actions = load<{ updateSettingsAction: (formData: FormData) => Promise<void> }>("modules/settings/actions.ts", {
    "@/lib/prisma": { prisma }, "@/shell/modules": modules, "@/lib/modules/installation": installation,
    "@/lib/auth": { requireAdmin: async () => ({ id: "admin" }), dataScopePresets: [], dataScopeConfigFromFormData: () => ({}) },
    "@/lib/admin-validation": { parseForm: async () => ({ themePreset: "after" }) },
    "@/lib/theme/tokens": { normalizeThemePreset: (value: string) => value },
    "@/lib/site": { getSiteSettings: async () => ({ enabledModuleIds: ["content"] }), resolveCurrentSite: async () => ({ id: "one" }) },
    "@/lib/audit": { recordAuditLog: async () => { effects.push("audit"); } },
    "next/cache": { revalidatePath: () => { effects.push("revalidate"); } },
    "next/navigation": { redirect: () => { effects.push("redirect"); } }
  });
  return {
    resolve: (ids: string[] = []) => installation.resolveEnabledModuleIds(ids, "one"),
    save: () => { const data = new FormData(); data.append("enabledModules", "media"); return actions.updateSettingsAction(data); },
    failRead: () => { failRead = true; }, failWrite: () => { failWrite = true; },
    concurrent: (row: Row) => { concurrentInsert = row; }, effects,
    get rows() { return rows; }, get settings() { return settings; }, get writes() { return writes; }
  };
}

test("installation seeding imports initial choices once and does not re-enable disabled modules", async () => {
  const h = harness();
  assert.deepEqual(await h.resolve(["media"]), ["dashboard", "media"]);
  assert.equal(h.writes, 1, "one bulk insert initializes the registry");
  assert.deepEqual(await h.resolve(["content"]), ["dashboard", "media"]);
  assert.equal(h.writes, 1, "established sites perform no writes during resolution");
});

test("new modules use defaults while existing and concurrent choices stay authoritative", async () => {
  const h = harness([{ siteId: "one", moduleId: "dashboard", enabled: true }, { siteId: "one", moduleId: "content", enabled: false }]);
  assert.deepEqual(await h.resolve(["content", "media"]), ["dashboard"]);
  const concurrent = harness();
  concurrent.concurrent({ siteId: "one", moduleId: "content", enabled: false });
  assert.deepEqual(await concurrent.resolve(["content"]), ["dashboard"]);
});

test("installation errors propagate instead of reverting to stale settings JSON", async () => {
  const read = harness(); read.failRead();
  await assert.rejects(read.resolve(["content"]), /database unavailable/);
  const write = harness(); write.failWrite();
  await assert.rejects(write.resolve(["content"]), /module write failed/);
});

test("settings and module choices commit together and affect only the selected site", async () => {
  const h = harness([{ siteId: "two", moduleId: "content", enabled: true }, { siteId: "one", moduleId: "excluded-from-build", enabled: true }]);
  await h.save();
  assert.equal(h.settings.themePreset, "after");
  assert.deepEqual(h.rows.filter(row => row.siteId === "one" && row.enabled).map(row => row.moduleId).sort(), ["dashboard", "excluded-from-build", "media"]);
  assert.equal(h.rows.find(row => row.siteId === "two")!.enabled, true);
  assert.ok(h.effects.includes("redirect"));
});

test("a module-write failure rolls back settings and does not report a successful save", async () => {
  const h = harness(); h.failWrite();
  await assert.rejects(h.save(), /module write failed/);
  assert.equal(h.settings.themePreset, "before");
  assert.deepEqual(h.rows, []);
  assert.deepEqual(h.effects, []);
});
