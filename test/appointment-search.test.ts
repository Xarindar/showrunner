import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("calendar search stays scoped and preserves its query in date navigation", async () => {
  const require = createRequire(import.meta.url);
  const queries: Record<string, unknown>[] = [];
  const empty = { findMany: async () => [], count: async () => 0 };
  const component = () => null;
  const mocks: Record<string, unknown> = {
    "@/lib/auth": {
      requireAdmin: async () => ({}),
      getAccessibleBookingWhere: async (_user: unknown, siteId: string, where: Record<string, unknown>) => ({ AND: [{ siteId, staffId: "allowed-staff" }, where] }),
      getAccessibleBookingWaitlistWhere: async () => ({ siteId: "site" })
    },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site", timezone: "UTC" }) },
    "@/lib/clients/configuration": { getClientStatusSettings: async () => ({ options: [] }) },
    "@/lib/bookings/conflicts": { bookingConflictWarnings: () => [] },
    "@/lib/timezone": {
      getTodayDateKey: () => "2026-11-12",
      parseZonedDateKey: (key: string) => new Date(`${key}T00:00:00Z`),
      addDaysToDateKey: (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
    },
    "@/lib/prisma": { prisma: { booking: { ...empty, findMany: async (query: Record<string, unknown>) => { queries.push(query); return []; } }, bookingWaitlistEntry: empty, staffMember: empty, resource: empty } },
    "./components/appointment-calendar": { AppointmentCalendar: component },
    "./components/appointment-date-picker": { AppointmentDatePicker: component },
    "./components/appointment-calendar-shell": { AppointmentCalendarShell: component },
    "./actions": {}, "@/components/ui/time-input": { DateTimeInput: component }, "@/components/ui": { Button: component }
  };
  const exports: Record<string, (props: unknown) => Promise<{props: {children: {props: Record<string, unknown>}}}>> = {};
  runInNewContext(ts.transpileModule(readFileSync("modules/appointments/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, Date, URLSearchParams, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id) });
  const page = await exports.default({ searchParams: Promise.resolve({ q: "  Ruby & Studio  ", staffId: "selected-staff", resourceId: "room" }) });
  const scoped = queries[0].where as { AND: [Record<string, unknown>, Record<string, unknown>] };
  assert.equal(scoped.AND[0].siteId, "site");
  assert.equal(scoped.AND[0].staffId, "allowed-staff");
  assert.equal(scoped.AND[1].staffId, "selected-staff");
  assert.equal((scoped.AND[1].startsAt as {lt: Date}).lt.toISOString(), "2027-01-01T00:00:00.000Z", "The next-month preview includes the whole next month");
  assert.equal((scoped.AND[1].OR as unknown[]).length, 5);
  assert.match(JSON.stringify(scoped.AND[1].OR), /Ruby & Studio/);
  assert.equal(page.props.children.props.searchQuery, "Ruby & Studio");
  const calendar = page.props.children.props.children as { props: { rangeControls: { props: { children: {props: {href: string}}[] } } } };
  for (const link of calendar.props.rangeControls.props.children.filter(child => child.props.href)) {
    const url = new URL(link.props.href, "http://localhost");
    assert.equal(url.searchParams.get("q"), "Ruby & Studio");
    assert.equal(url.searchParams.get("resourceId"), "room");
  }
  await exports.default({ searchParams: Promise.resolve({ q: "   " }) });
  assert.equal("OR" in (queries[1].where as typeof scoped).AND[1], false);
  await exports.default({ searchParams: Promise.resolve({ q: "x".repeat(250) }) });
  assert.match(JSON.stringify((queries[2].where as typeof scoped).AND[1].OR), new RegExp(`"contains":"${"x".repeat(200)}"`));
  for (const [view, date, label] of [
    ["day", "2026-09-19", "09/19/26"],
    ["month", "2026-10-01", "October 2026"],
    ["month", "2026-11-01", "November 2026"],
    ["week", "2026-09-23", "09/20/26 – 09/26/26"],
    ["week", "2027-01-01", "12/27/26 – 01/02/27"],
    ["day", "2027-01-01", "01/01/27"]
  ]) {
    const result = await exports.default({ searchParams: Promise.resolve({ view, date }) });
    const controls = result.props.children.props.children as typeof calendar;
    assert.equal((controls.props.rangeControls.props.children[1].props as unknown as { label: string }).label, label);
  }

  for (const [date, label] of [["2026-11-12", "This Week"], ["2026-11-01", "Previous Week"], ["2026-11-29", "Next Week"]]) {
    const result = await exports.default({ searchParams: Promise.resolve({ view: "week", date }) });
    const controls = result.props.children.props.children as typeof calendar;
    assert.equal((controls.props.rangeControls.props.children[1].props as unknown as { compactLabel: string }).compactLabel, label);
  }

});
