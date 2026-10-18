import assert from "node:assert/strict";
import test from "node:test";
import { searchAdminNavigation } from "../shell/admin-navigation-search";

const available = [
  { id: "dashboard", label: "Dashboard", href: "/admin" },
  { id: "scheduling", label: "Services", href: "/admin/modules/services" },
  { id: "clients", label: "Clients", href: "/admin/modules/clients" }
];

test("navigation search finds nested service pages and normalizes words", () => {
  assert.deepEqual(searchAdminNavigation(available, "  SERVICES   BUNDLES "), [{ label: "Service bundles", href: "/admin/modules/services/packages" }]);
  assert.deepEqual(searchAdminNavigation(available, "session"), [{ label: "Session types", href: "/admin/modules/services" }]);
  assert.deepEqual(searchAdminNavigation(available, "home"), [{ label: "Home", href: "/admin" }]);
  assert.equal(new Set(searchAdminNavigation(available, "services").map(page => page.href)).size, 3);
});

test("navigation search stays within the caller's available modules", () => {
  assert.deepEqual(searchAdminNavigation(available.filter(item => item.id !== "scheduling"), "categories"), []);
  assert.deepEqual(searchAdminNavigation(available, "settings"), []);
  assert.deepEqual(searchAdminNavigation(available, "not a page"), []);
});
