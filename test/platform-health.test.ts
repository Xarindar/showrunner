import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { PlatformStatus } from "../lib/platform-status";
import type { PlatformWarning } from "../lib/platform-health";

const source = readFileSync("lib/platform-status.ts", "utf8");
function harness(outcome: "healthy" | "load-failed" | "check-failed", enabled = ["scheduling", "content"]) {
  const imports: string[] = [];
  const failures: unknown[][] = [];
  const registry = ["scheduling", "media", "content"].map(id => ({ id, label: id === "scheduling" ? "Services" : id, href: `/admin/modules/${id === "scheduling" ? "services" : id}`, readiness: { level: "live", mode: "live" } }));
  const checks = [{ title: "Service needs hours", detail: "Add hours.", severity: "warning", moduleId: "scheduling" }];
  const mocks = {
    "@/lib/platform-health": {
      warning: (title: string, detail: string, severity: PlatformWarning["severity"], moduleId: string, href: string) => ({ title, detail, severity, moduleId, href }),
      envLooksDefault: () => false
    },
    "@/shell/modules": { moduleRegistry: registry }
  } as Record<string, unknown>;
  const exports = {} as { getPlatformStatus: (settings: { enabledModuleIds: string[] }) => Promise<PlatformStatus> };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env: { AUTH_SECRET: "a".repeat(32) } }, console: { error: (...args: unknown[]) => { failures.push(args); } },
    require: (id: string) => {
      if (!id.endsWith("/health")) return mocks[id] ?? {};
      imports.push(id);
      if (outcome === "load-failed") throw new Error("health import failed");
      return { getHealth: async () => { if (outcome === "check-failed") throw new Error("database unavailable"); return checks; } };
    }
  });
  return { run: () => exports.getPlatformStatus({ enabledModuleIds: enabled }), imports, failures };
}

test("health aggregation loads only enabled modules with registered checks", async () => {
  const h = harness("healthy");
  const result = await h.run();
  assert.deepEqual(h.imports, ["@/modules/scheduling/health"]);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].title, "Service needs hours");
  assert.equal(result.modules.find(module => module.module.id === "scheduling")!.warnings.length, 1);
  assert.equal(h.failures.length, 0);
  const disabled = harness("check-failed", ["content"]);
  assert.equal((await disabled.run()).warnings.length, 0);
  assert.deepEqual(disabled.imports, []);
});

for (const outcome of ["load-failed", "check-failed"] as const) {
  test(`${outcome} produces a visible warning using the module's current label and route`, async () => {
    const h = harness(outcome);
    const result = await h.run();
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].title, "Services health check unavailable");
    assert.equal(result.warnings[0].href, "/admin/modules/services");
    assert.equal(result.warnings[0].severity, "warning");
    assert.equal(result.modules.find(module => module.module.id === "scheduling")!.warnings.length, 1);
    assert.equal(h.failures.length, 1);
    assert.doesNotMatch(result.warnings[0].detail, /database|import/i, "internal errors stay in logs");
  });
}

test("every module health file has one explicit loader", () => {
  const files = readdirSync("modules").filter(id => existsSync(`modules/${id}/health.ts`)).sort();
  const imports = [...source.matchAll(/import\("@\/modules\/([^/]+)\/health"\)/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, files);
});
