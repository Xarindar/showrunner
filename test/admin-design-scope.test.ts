import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { list, parse } from "postcss";

test("admin design rules cannot recolor public routes or escape into the website iframe", () => {
  for (const path of ["app/admin/design-tokens.css", "app/admin/design-system.css", "app/admin/loading.css"]) {
    parse(readFileSync(path, "utf8")).walkRules(rule => {
      for (const selector of list.comma(rule.selector)) {
        assert(selector.startsWith(".showrunner-admin") || selector.startsWith("html:has(.showrunner-admin)"), `${path}: unscoped selector ${selector}`);
        assert(!selector.includes("iframe *"), "Never style the client's website through admin selectors");
      }
    });
  }
  const root = readFileSync("app/layout.tsx", "utf8");
  assert(!root.includes("design-tokens.css") && !root.includes("design-system.css"), "Admin CSS belongs in the admin route layout");
  assert(root.includes("themeToCssVars"), "Public pages retain tenant theme variables");
});

test("shared input boundaries remain inside controls in every visual state", () => {
  const tokens = new Map<string, string>();
  parse(readFileSync("app/admin/design-system.css", "utf8")).walkDecls(declaration => {
    if (declaration.prop.startsWith("--sd-shadow-input")) tokens.set(declaration.prop, declaration.value);
  });
  for (const state of ["", "-focus", "-critical", "-disabled"]) {
    const shadows = list.comma(tokens.get(`--sd-shadow-input${state}`) || "");
    const rings = shadows.filter(shadow => /0rem 0rem 0rem/.test(shadow));
    assert(rings.some(shadow => shadow.startsWith("inset ")), `${state || "normal"} needs an unclippable boundary`);
  }
  assert.match(tokens.get("--sd-shadow-input-focus")!, /inset 0rem 0rem 0rem \.125rem/, "Keyboard focus stays visible without relying on outer glow");
});
