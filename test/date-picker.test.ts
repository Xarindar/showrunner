import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("calendar month includes complete weeks and handles leap days and year boundaries", () => {
  const require = createRequire(import.meta.url);
  const exports: Record<string, (month: string) => { key: string; day: number; outside: boolean }[]> = {};
  runInNewContext(ts.transpileModule(readFileSync("components/ui/date-picker.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, Date, require: (id: string) => id === "./button" ? { Button: () => null } : require(id) });
  const february = exports.calendarMonthDays("2028-02");
  assert.equal(february.length, 42);
  assert.equal(february[0].key, "2028-01-30");
  assert.equal(february.find(day => day.key === "2028-02-29")?.outside, false);
  assert.equal(february.at(-1)?.key, "2028-03-11");
  const december = exports.calendarMonthDays("2026-12");
  assert.equal(december[0].key, "2026-11-29");
  assert.equal(december.at(-1)?.key, "2027-01-09");
  assert.equal(december.find(day => day.key === "2027-01-01")?.outside, true);
});
