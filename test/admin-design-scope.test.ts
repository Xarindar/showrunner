import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { list, parse } from "postcss";

function stylesheets(path: string, files = new Set<string>()) {
  path = resolve(path);
  if (files.has(path)) return files;
  files.add(path);
  parse(readFileSync(path, "utf8")).walkAtRules("import", rule => {
    const relative = rule.params.match(/^"(.+)"$/)?.[1];
    assert(relative, `Stylesheet imports must be local: ${rule.params}`);
    stylesheets(resolve(dirname(path), relative), files);
  });
  return files;
}

const adminStyles = new Set([
  ...stylesheets("app/admin/design-system.css"),
  resolve("app/admin/design-tokens.css"),
  resolve("app/admin/loading.css"),
  resolve("app/admin/notifications.css")
]);

test("admin design rules cannot recolor public routes or escape into the website iframe", () => {
  for (const path of adminStyles) {
    parse(readFileSync(path, "utf8")).walkRules(rule => {
      for (const selector of list.comma(rule.selector)) {
        if (rule.parent?.type === "atrule" && rule.parent.name.endsWith("keyframes")) continue;
        assert(selector.startsWith(".showrunner-admin") || selector.startsWith("html:has(.showrunner-admin"), `${path}: unscoped selector ${selector}`);
        assert(!selector.includes("iframe *"), "Never style the client's website through admin selectors");
      }
    });
  }
  const root = readFileSync("app/layout.tsx", "utf8");
  assert(!root.includes("design-tokens.css") && !root.includes("design-system.css"), "Admin CSS belongs in the admin route layout");
  assert(!root.includes("themeToCssVars"), "Admin must not inherit tenant theme settings from the root layout");
  assert(readFileSync("components/public/theme.tsx", "utf8").includes("themeToCssVars"), "Public pages retain tenant branding");
  for (const route of ["proofs", "uploads"]) {
    assert(readFileSync(`app/${route}/layout.tsx`, "utf8").includes("PublicTheme"));
  }
  assert(!readFileSync("app/globals.css", "utf8").includes("--color-"), "Document resets must not own a design system");
});

test("shared input boundaries remain inside controls in every visual state", () => {
  const tokens = new Map<string, string>();
  parse(readFileSync("app/admin/design-tokens.css", "utf8")).walkDecls(declaration => {
    if (declaration.prop.startsWith("--sd-shadow-input")) tokens.set(declaration.prop, declaration.value);
  });
  for (const state of ["", "-focus", "-critical", "-disabled"]) {
    const shadows = list.comma(tokens.get(`--sd-shadow-input${state}`) || "");
    const rings = shadows.filter(shadow => /0rem 0rem 0rem/.test(shadow));
    assert(rings.some(shadow => shadow.startsWith("inset ")), `${state || "normal"} needs an unclippable boundary`);
  }
  assert.match(tokens.get("--sd-shadow-input-focus")!, /inset 0rem 0rem 0rem \.125rem/, "Keyboard focus stays visible without relying on outer glow");
});

test("admin appearance values come from tokens, including module styles", () => {
  const files = new Set(adminStyles);
  for (const directory of ["components/ui", "modules"]) {
    for (const file of readdirSync(directory, { recursive: true, encoding: "utf8" })) {
      if (file.endsWith(".module.css") && !file.endsWith("proof-client.module.css")) files.add(resolve(directory, file));
    }
  }
  for (const file of files) {
    if (file.endsWith("design-tokens.css")) continue;
    parse(readFileSync(file, "utf8")).walkDecls(declaration => {
      assert(!/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(declaration.value), `${file}:${declaration.source?.start?.line}: literal color ${declaration.value}`);
      if (declaration.prop === "font-family") assert(/var\(|inherit/.test(declaration.value), `${file}: use the shared font token`);
      if (declaration.prop === "box-shadow") assert(/^(?:none|inherit|var\(--[\w-]+\))$/.test(declaration.value), `${file}: use an elevation token`);
    });
  }
});

test("admin token aliases resolve without tenant values or circular references", () => {
  const tokens = new Map<string, string>();
  parse(readFileSync("app/admin/design-tokens.css", "utf8")).walkDecls(declaration => {
    assert(!tokens.has(declaration.prop), `Duplicate token ${declaration.prop}`);
    tokens.set(declaration.prop, declaration.value);
  });
  function resolveToken(name: string, stack: string[]) {
    if (name === "--font-geist-sans" || name === "--font-geist-mono") return;
    assert(tokens.has(name), `Undefined token ${name}`);
    assert(!stack.includes(name), `Circular token reference: ${[...stack, name].join(" → ")}`);
    for (const match of tokens.get(name)!.matchAll(/var\((--[\w-]+)/g)) resolveToken(match[1], [...stack, name]);
  }
  for (const name of tokens.keys()) resolveToken(name, []);
  for (let step = 1; step <= 12; step++) assert(tokens.has(`--space-${step}`), "Admin spacing must be independent of public presets");
});
