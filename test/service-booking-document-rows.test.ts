import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as documents from "../lib/scheduling/booking-documents";
import * as rules from "../lib/scheduling/booking-rules";

function render(initialSelection?: unknown) {
  const require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = {
    "@/components/ui/responsive-table": { ResponsiveTableFrame: "div" },
    "@/components/ui/button": { Button: "button", ButtonLink: "a" },
    "@/components/ui/field": { Field: "label", Input: "input", Select: "select", Textarea: "textarea" },
    "@/components/ui/modal": { Modal: () => null },
    "@/components/ui/switch": { Switch: () => null },
    "@/components/ui/notifications": { useNotify: () => () => {} },
    "@/lib/scheduling/booking-rules": rules,
    "@/lib/scheduling/booking-documents": documents,
    "@/modules/scheduling/components/booking-question-choices": {},
    "../booking-rule-actions": {}
  };
  const exports: { ServiceBookingRulesTable?: ComponentType<Record<string, unknown>> } = {};
  const source = ts.transpileModule(readFileSync("modules/scheduling/components/service-booking-rules-table.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return renderToStaticMarkup(createElement(exports.ServiceBookingRulesTable!, {
    idPrefix: "test", initialSelection,
    documents: [
      { id: "intake", name: "General intake", kind: "INTAKE", isDefault: true, rules: [] },
      { id: "terms", name: "Standard terms", kind: "TERMS", isDefault: true, rules: [] },
      { id: "custom", name: "Wedding intake", kind: "INTAKE", isDefault: false, rules: [] }
    ]
  }));
}

test("forms and terms appear as default rows without separate dropdowns", () => {
  const html = render();
  assert.match(html, /<strong>Intake form<\/strong>/);
  assert.match(html, /General intake · Global default/);
  assert.match(html, /Standard terms · Global default/);
  assert.match(html, /aria-label="Choose Intake form"/);
  assert.doesNotMatch(html, /<select|booking-document-choices/);
});

test("document rows preserve session overrides and explicitly disabled defaults", () => {
  const html = render({ intake: "custom", terms: "none" });
  assert.match(html, /Wedding intake/);
  assert.match(html, /None for this session/);
  assert.doesNotMatch(html, /General intake|Standard terms/);
});
