import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("date selection preserves view and filters", () => {
  const require = createRequire(import.meta.url);
  let destination = "";
  const exports: Record<string, (props: unknown) => { props: Record<string, unknown> }> = {};
  const mocks: Record<string, unknown> = {
    "next/navigation": { useRouter: () => ({ replace: (url: string) => { destination = url; } }) },
    "@/components/ui/date-picker": { DatePicker: () => null }
  };
  runInNewContext(ts.transpileModule(readFileSync("modules/appointments/components/appointment-date-picker.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, URL, window: { location: { href: "http://localhost/admin/modules/appointments?date=2026-11-03&view=week&q=Ruby&staffId=staff&resourceId=room" } }, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const picker = exports.AppointmentDatePicker({ dateKey: "2026-11-03", label: "11/01/26 – 11/07/26" });
  assert.equal(picker.props.value, "2026-11-03");
  const change = picker.props.onChange as (date: string) => void;
  change("2026-12-31");
  const url = new URL(destination, "http://localhost");
  assert.equal(url.searchParams.get("date"), "2026-12-31");
  for (const [key, value] of [["view", "week"], ["q", "Ruby"], ["staffId", "staff"], ["resourceId", "room"]]) assert.equal(url.searchParams.get(key), value);
});
