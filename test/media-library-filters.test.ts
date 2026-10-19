import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("media opens the full library and preserves bookmarked categories and filters", () => {
  const source = readFileSync(new URL("../modules/media/page.tsx", import.meta.url), "utf8");
  const exports: { filtersFromParams?: (params: Record<string, string>) => Record<string, unknown> } = {};
  runInNewContext(ts.transpileModule(`${source}\nexport { filtersFromParams };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require: () => ({}) });
  const filters = exports.filtersFromParams!;
  assert.equal(filters({}).scope, "all");
  assert.equal(filters({ scope: "home", page: "2" }).scope, "all");
  assert.equal(filters({ scope: "unknown" }).scope, "all");
  const bookmarked = filters({ scope: "private", tag: " Venue ", q: " Garden ", page: "2", sort: "name" });
  assert.equal(bookmarked.scope, "private");
  assert.equal(bookmarked.tag, "Venue");
  assert.equal(bookmarked.q, "Garden");
  assert.equal(bookmarked.page, 2);
  assert.equal(bookmarked.sort, "name");
  assert.equal(filters({ page: "-1", kind: "script" }).page, 1);
  assert.equal(filters({ kind: "script" }).kind, "all");
});
