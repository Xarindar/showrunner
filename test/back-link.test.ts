import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("Back links follow browser history, retain direct-entry fallback and respect modified clicks", () => {
  const require = createRequire(import.meta.url);
  const history = { length: 1, back: () => { backs++; } };
  let backs = 0;
  const exports: { BackLink?: (props: object) => { props: { onClick: (event: object) => void; href: string } } } = {};
  const source = ts.transpileModule(readFileSync("components/ui/back-link.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, window: { history }, require: (id: string) => id === "./button" ? { ButtonLink: "a" } : require(id) });
  const link = exports.BackLink!({ href: "/admin/modules/clients" });
  const event = { button: 0, defaultPrevented: false, ctrlKey: false, preventDefault() { this.defaultPrevented = true; } };
  link.props.onClick(event); assert.equal(backs, 0); assert.equal(event.defaultPrevented, false);
  history.length = 3;
  link.props.onClick({ ...event, ctrlKey: true }); assert.equal(backs, 0);
  link.props.onClick(event); assert.equal(backs, 1); assert.equal(event.defaultPrevented, true);
  assert.equal(link.props.href, "/admin/modules/clients");
});
