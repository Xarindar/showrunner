import assert from "node:assert/strict";
import test from "node:test";
import { defaultEnabledModules, moduleRegistry, normalizeModules, requiredModuleIds } from "../shell/modules";

test("only absent module selections use defaults; an empty selection retains required modules", () => {
  assert.deepEqual(normalizeModules(undefined), defaultEnabledModules);
  assert.deepEqual(normalizeModules(null), defaultEnabledModules);
  assert.deepEqual(normalizeModules([]), requiredModuleIds);
  assert.deepEqual(normalizeModules(["unknown", 123]), requiredModuleIds);
});

test("module selection removes duplicates and unknown IDs without enabling unrelated modules", () => {
  const optional = moduleRegistry.find(module => !module.required && module.status === "active")!;
  assert.deepEqual(normalizeModules([optional.id, optional.id, "unknown"]), [...requiredModuleIds, optional.id]);
});
