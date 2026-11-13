import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

test("appointment notes require booking access and scope deletions to the accessible booking", async () => {
  const require = createRequire(import.meta.url);
  let accessible = true;
  const creates: unknown[] = [], deletes: unknown[] = [], updates: unknown[] = [], permissions: string[] = [];
  const bookingWhere = { id: "booking", siteId: "site", staffId: "staff" };
  const mocks: Record<string, unknown> = {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("redirect"); } },
    "@/lib/auth": { requireAdmin: async (permission: string) => { permissions.push(permission); return {}; }, getAccessibleBookingWhere: async () => bookingWhere },
    "@/lib/admin-validation": { parseForm: async (_schema: unknown, input: unknown) => input },
    "@/lib/bookings/reschedule": {}, "@/lib/bookings/status": {}, "@/lib/events/emit": {}, "@/lib/scheduling/native": {}, "@/lib/timezone": {},
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site" }) },
    "@/lib/prisma": { prisma: {
      booking: { findFirst: async () => accessible ? { id: "booking" } : null, updateMany: async (query: unknown) => updates.push(query) },
      bookingNote: { create: async (query: unknown) => creates.push(query), deleteMany: async (query: unknown) => deletes.push(query) }
    } }
  };
  const exports: Record<string, (input: unknown) => Promise<void>> = {};
  const output = ts.transpileModule(readFileSync("modules/appointments/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  await exports.addBookingNoteAction({ id: "booking", content: "Staff only" });
  assert.equal(JSON.stringify(creates[0]), JSON.stringify({ data: { bookingId: "booking", content: "Staff only" } }));
  accessible = false;
  await assert.rejects(exports.addBookingNoteAction({ id: "foreign", content: "Wrong site" }), /redirect/);
  assert.equal(creates.length, 1);
  await exports.deleteBookingNoteAction({ id: "booking", noteId: "note", confirmDelete: "on" });
  assert.equal(JSON.stringify(deletes[0]), JSON.stringify({ where: { id: "note", bookingId: "booking", booking: bookingWhere } }));
  accessible = true;
  await exports.updateBookingDetailAction({ id: "booking", sessionName: "Portrait", agreedPrice: 0, sessionLocation: "Studio" });
  assert.equal(JSON.stringify(updates[0]), JSON.stringify({ where: bookingWhere, data: { sessionName: "Portrait", priceCents: 0, sessionLocation: "Studio" } }));
  await exports.updateBookingDetailAction({ id: "booking", adminNotes: "Legacy caller" });
  assert.equal(JSON.stringify(updates[1]), JSON.stringify({ where: bookingWhere, data: { adminNotes: "Legacy caller" } }));
  assert(permissions.every(permission => permission === "appointments:manage"));
});

test("detail edits save dates and fields together, skip unchanged times and preserve fields on scheduling errors", async () => {
  const require = createRequire(import.meta.url);
  const startsAt = new Date("2099-01-01T10:00:00Z"), endsAt = new Date("2099-01-01T11:00:00Z");
  let allowed = true, conflict = false;
  const updates: unknown[] = [], moves: Record<string, unknown>[] = [], events: Record<string, unknown>[] = [];
  const where = { id: "booking", siteId: "site", staffId: "staff" };
  const mocks: Record<string, unknown> = {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "@/lib/auth": { requireAdmin: async () => ({}), getAccessibleBookingWhere: async () => where },
    "@/lib/admin-validation": { parseForm: async (_schema: unknown, input: unknown) => input },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site", timezone: "UTC" }) },
    "@/lib/timezone": { parseZonedDateTimeInput: (value: string) => value === "invalid" ? null : new Date(`${value}Z`) },
    "@/lib/prisma": { prisma: { booking: {
      findFirst: async () => allowed ? { id: "booking", startsAt, endsAt } : null,
      updateMany: async (input: unknown) => updates.push(input)
    } } },
    "@/lib/bookings/reschedule": { rescheduleBookingWithAvailability: async (input: Record<string, unknown>) => {
      if (conflict) throw new Error("Time unavailable");
      moves.push(input);
      return { id: "booking", customerEmail: "test@example.com", serviceId: "service", service: { name: "Session" }, startsAt: input.startsAt, staffId: "staff" };
    } },
    "@/lib/events/emit": { emitModuleEvent: async (name: string, event: Record<string, unknown>) => { assert.equal(name, "booking.rescheduled"); events.push(event); } },
    "@/lib/bookings/status": {}, "@/lib/scheduling/native": {}
  };
  const exports: Record<string, (input: unknown) => Promise<void>> = {};
  runInNewContext(ts.transpileModule(readFileSync("modules/appointments/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Error, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  const input = { id: "booking", startsAt: "2099-01-01T10:00", sessionName: "Portrait", sessionLocation: "Studio", agreedPrice: 12300, notifyCustomer: true };
  await exports.updateBookingDetailAction(input);
  assert.equal(updates.length, 1);
  assert.equal(moves.length, 0);
  assert.equal(events.length, 0);
  for (const notifyCustomer of [true, false]) {
    await exports.updateBookingDetailAction({ ...input, startsAt: "2099-01-02T10:00", notifyCustomer });
    assert.equal(JSON.stringify(moves.at(-1)), JSON.stringify({ bookingId: "booking", siteId: "site", startsAt: new Date("2099-01-02T10:00Z"), details: { sessionName: "Portrait", priceCents: 12300, sessionLocation: "Studio" } }));
    assert.equal((events.at(-1)!.metadata as Record<string, unknown>).notifyCustomer, notifyCustomer);
  }
  conflict = true;
  await assert.rejects(exports.updateBookingDetailAction({ ...input, startsAt: "2099-01-02T10:00" }), /Time%20unavailable/);
  await assert.rejects(exports.updateBookingDetailAction({ ...input, startsAt: "invalid" }), /valid%20appointment/);
  allowed = false;
  await assert.rejects(exports.updateBookingDetailAction(input), /not%20found/);
  assert.equal(updates.length, 1);
  assert.equal(moves.length, 2);
  assert.equal(events.length, 2);
});
