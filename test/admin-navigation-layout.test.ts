import assert from "node:assert/strict";
import test from "node:test";
import {
  groupAdminModuleNavigationLayout,
  moveAdminModuleNavigationItem
} from "../shell/admin-navigation-layout";
import type { AdminModuleNavigationLayoutItem } from "../shell/module-navigation";

const layout: AdminModuleNavigationLayoutItem[] = [
  { category: "primary", moduleId: "dashboard" },
  { category: "primary", moduleId: "clients" },
  { category: "website", moduleId: "content" },
  { category: "website", moduleId: "media" },
  { category: "finance", moduleId: "payments" }
];

test("module navigation moves a top-level module into a category at the requested position", () => {
  const result = moveAdminModuleNavigationItem(layout, "clients", "website", "media");

  assert.deepEqual(result, [
    { category: "primary", moduleId: "dashboard" },
    { category: "website", moduleId: "content" },
    { category: "website", moduleId: "clients" },
    { category: "website", moduleId: "media" },
    { category: "finance", moduleId: "payments" }
  ]);
});

test("module navigation moves a categorized module back to the top level", () => {
  const result = moveAdminModuleNavigationItem(layout, "media", "primary");

  assert.deepEqual(result, [
    { category: "primary", moduleId: "dashboard" },
    { category: "primary", moduleId: "clients" },
    { category: "primary", moduleId: "media" },
    { category: "website", moduleId: "content" },
    { category: "finance", moduleId: "payments" }
  ]);
});

test("grouping enforces the navigation section order without changing order inside a section", () => {
  const result = groupAdminModuleNavigationLayout([
    { category: "finance", moduleId: "billing" },
    { category: "website", moduleId: "media" },
    { category: "primary", moduleId: "dashboard" },
    { category: "website", moduleId: "content" }
  ]);

  assert.deepEqual(result.map((item) => item.moduleId), ["dashboard", "media", "content", "billing"]);
});
