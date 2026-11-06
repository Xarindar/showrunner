import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { initialBusinessHoursSchema, manualSessionSchema, sessionPrice } from "../lib/scheduling/session-input";

const require = createRequire(import.meta.url);
// Database delegates have deliberately different query/result shapes in this boundary harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordData = Record<string, any>;
function load(path: string, mocks: RecordData): RecordData {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (id: string) => id === "server-only" ? {} : mocks[id] ?? require(id), Date, console });
  return exports;
}
function harness(options: { conflict?: boolean; missingService?: boolean; busy?: boolean; hourlyRate?: RecordData; offering?: RecordData } = {}) {
  const writes: RecordData[] = [];
  const service = { id: "type", name: "Family photos", bufferBeforeMinutes: 0, bufferAfterMinutes: 15, staffAssignments: [], resourceAssignments: [{ resourceId: "room" }], sessionOffering: options.offering, ...(options.hourlyRate ? { pricingType: "HOURLY", hourlyRate: options.hourlyRate } : {}) };
  const db = {
    hourlyRate: { findFirst: async ({ where }: RecordData) => options.hourlyRate?.id === where.id && options.hourlyRate?.siteId === where.siteId ? options.hourlyRate : null },
    service: { findFirst: async (query: RecordData) => { assert.equal(query.where.siteId, "site-a"); return options.missingService ? null : service; }, create: async ({ data }: RecordData) => { writes.push({ kind: "service", ...data }); return { ...service, id: "private" }; } },
    staffMember: { findFirst: async () => ({ id: "staff" }) },
    booking: { findMany: async () => options.conflict ? [{ id: "existing", staffId: null, startsAt: new Date("2099-01-01T09:00:00Z"), endsAt: new Date("2099-01-01T09:50:00Z"), service: { bufferBeforeMinutes: 0, bufferAfterMinutes: 20, resourceAssignments: [] }, resources: [] }] : [], create: async ({ data }: RecordData) => { writes.push({ kind: "booking", ...data }); return { id: "booking", ...data }; } },
    blockedTime: { findFirst: async () => null }
  };
  const conflicts = load("lib/bookings/conflicts.ts", {});
  const api = load("lib/bookings/manual.ts", {
    "@/lib/prisma": { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } },
    "@/lib/clients/public-client": { upsertPublicClient: async () => { writes.push({ kind: "client" }); return "client"; } },
    "@/lib/bookings/conflicts": conflicts,
    "@/lib/scheduling/google-calendar": { listGoogleBusyWindows: async () => ({ busy: options.busy ? [{ start: new Date("2099-01-01T10:00:00Z"), end: new Date("2099-01-01T11:00:00Z") }] : [] }) }
  });
  return { api, writes };
}
const input = { siteId: "site-a", timezone: "America/Chicago", name: "Family photos", startsAt: new Date("2099-01-01T10:00:00Z"), durationMinutes: 45, priceCents: 17550, location: "Client's home", customerName: "Test client", customerEmail: "client@example.test", notes: "", status: "CONFIRMED" };

test("bookings use the selected package's pricing even when the session default differs", async () => {
  const hourlyRate = { id: "rate", siteId: "site-a", name: "Photography", amountCents: 12550 };
  const offering = { coverageItems: [], tiers: [
    { id: "flat", name: "Flat", durationMinutes: 60, priceCents: 10000, coverageIds: [], pricingType: "FLAT_RATE" },
    { id: "hourly", name: "Hourly", durationMinutes: 90, priceCents: 1, coverageIds: [], pricingType: "HOURLY", hourlyRateId: "rate" }
  ], addOns: [{ id: "album", name: "Album", priceCents: 2500 }] };
  const flat = await harness({ hourlyRate, offering }).api.createManualSession({ ...input, serviceId: "type", tierId: "flat", priceCents: 10000 });
  assert.equal(flat.priceCents, 10000);
  assert.equal(flat.packageSnapshot.pricingType, "FLAT_RATE");
  const hourly = await harness({ hourlyRate, offering }).api.createManualSession({ ...input, serviceId: "type", tierId: "hourly", durationMinutes: 90, priceCents: 21325, addOnIds: ["album"] });
  assert.equal(hourly.priceCents, 21325);
  assert.equal(hourly.packageSnapshot.hourlyRate.id, "rate");
  await assert.rejects(harness({ offering, hourlyRate: { ...hourlyRate, siteId: "foreign" } }).api.createManualSession({ ...input, serviceId: "type", tierId: "hourly" }), /from this business/);
});

test("session price validates cents, including zero, without accepting negatives or precision loss", () => {
  assert.equal(sessionPrice.parse("175.50"), 17550);
  assert.equal(sessionPrice.parse("0"), 0);
  for (const price of ["", "-1", "NaN", "2.999", "1e8", "99999999"]) assert.equal(sessionPrice.safeParse(price).success, false);
  assert.equal(manualSessionSchema.safeParse({ ...input, startsAt: "2099-01-01T10:00", price: "10", customerEmail: "invalid" }).success, false);
  assert.equal(manualSessionSchema.parse({ ...input, location: undefined, startsAt: "2099-01-01T10:00", price: "10" }).location, "");
});
test("initial business hours require real weekdays and an increasing time range", () => {
  assert.equal(initialBusinessHoursSchema.parse({ weekdays: ["1", "5"], start: "09:00", end: "17:30" }).end, 1050);
  for (const value of [{ weekdays: [], start: "09:00", end: "17:00" }, { weekdays: [7], start: "09:00", end: "17:00" }, { weekdays: [1], start: "17:00", end: "09:00" }]) assert.equal(initialBusinessHoursSchema.safeParse(value).success, false);
});
test("one-off creates a private service and client-linked booking with agreed price and duration", async () => {
  const { api, writes } = harness();
  const booking = await api.createManualSession(input);
  assert.equal(writes[0].isActive, false);
  assert.equal(writes[0].isOneOff, true);
  assert.equal(booking.clientId, "client");
  assert.equal(booking.priceCents, 17550);
  assert.equal(booking.sessionLocation, "Client's home");
  assert.equal(booking.endsAt.getTime() - booking.startsAt.getTime(), 45 * 60000);
});
test("existing type is reused without rewriting its catalog values", async () => {
  const { api, writes } = harness();
  const booking = await api.createManualSession({ ...input, serviceId: "type" });
  assert.equal(writes.some(write => write.kind === "service"), false);
  assert.equal(booking.serviceId, "type");
  assert.equal(booking.resources.create[0].resourceId, "room");
});

test("hourly bookings calculate on the server and reject another business's rate", async () => {
  const hourlyRate = { id: "rate", siteId: "site-a", name: "Photography", amountCents: 12550 };
  const booking = await harness({ hourlyRate }).api.createManualSession({ ...input, serviceId: "type", priceCents: 18825, durationMinutes: 90 });
  assert.equal(booking.priceCents, 18825);
  assert.equal(booking.packageSnapshot.hourlyRate.amountCents, 12550);
  await assert.rejects(harness({ hourlyRate }).api.createManualSession({ ...input, serviceId: "type", priceCents: 1 }), /price has changed/);
  hourlyRate.amountCents = 20000;
  assert.equal(booking.priceCents, 18825);
  assert.equal(booking.packageSnapshot.hourlyRate.amountCents, 12550);
  await assert.rejects(harness({ hourlyRate: { ...hourlyRate, siteId: "another-business" } }).api.createManualSession({ ...input, serviceId: "type" }), /from this business/);
});

test("hourly bookings use the booked duration and add flat extras once", async () => {
  const hourlyRate = { id: "rate", siteId: "site-a", name: "Photography", amountCents: 12550 };
  const offering = { coverageItems: [], tiers: [{ id: "standard", name: "Standard", durationMinutes: 60, priceCents: 100, coverageIds: [] }], addOns: [{ id: "album", name: "Album", priceCents: 2500 }] };
  const booking = await harness({ hourlyRate, offering }).api.createManualSession({ ...input, serviceId: "type", tierId: "standard", addOnIds: ["album"], durationMinutes: 90, priceCents: 21325 });
  assert.equal(booking.priceCents, 21325);
  assert.equal(booking.packageSnapshot.durationMinutes, 90);
  assert.equal(booking.packageSnapshot.extras[0].priceCents, 2500);
});
test("conflicts include the existing booking's buffer; failure creates no client or one-off record", async () => {
  const { api, writes } = harness({ conflict: true });
  await assert.rejects(api.createManualSession(input), /overlaps/);
  assert.equal(writes.length, 0);
});
test("rejects foreign or inactive session types and connected calendar conflicts", async () => {
  await assert.rejects(harness({ missingService: true }).api.createManualSession({ ...input, serviceId: "foreign" }), /available session type/);
  await assert.rejects(harness({ busy: true }).api.createManualSession(input), /connected calendar/);
});
test("manual rescheduling preserves the agreed duration without requiring public slots", async () => {
  const booking = { id: "booking", siteId: "site-a", isManual: true, status: "CONFIRMED", staffId: null,
    startsAt: new Date("2099-01-01T10:00:00Z"), endsAt: new Date("2099-01-01T10:45:00Z"), resources: [],
    service: { durationMinutes: 90, bufferBeforeMinutes: 0, bufferAfterMinutes: 15 } };
  let checked = false;
  const db = { booking: { findFirst: async () => booking, update: async ({ data }: RecordData) => ({ ...booking, ...data }) } };
  const api = load("lib/bookings/reschedule.ts", {
    "@/lib/prisma": { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } },
    "@/lib/bookings/conflicts": load("lib/bookings/conflicts.ts", {}),
    "@/lib/bookings/manual": { checkManualSessionTime: async () => { checked = true; } },
    "@/lib/scheduling/native": { nativeSchedulingAdapter: { getSlotDiagnostics: () => { throw new Error("Manual sessions must not require public slots"); } } },
    "@/lib/scheduling/google-calendar": { listGoogleBusyWindows: async () => ({ busy: [] }) },
    "@/lib/site": { getSiteSettingsForSite: async () => ({ timezone: "America/Chicago" }) }
  });
  const updated = await api.rescheduleBookingWithAvailability({ bookingId: "booking", siteId: "site-a", startsAt: new Date("2099-01-02T14:00:00Z") });
  assert.equal(checked, true);
  assert.equal(updated.endsAt.getTime() - updated.startsAt.getTime(), 45 * 60000);
});
test("additive session migration preserves existing links and unknown historical prices", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Service" (id text, slug text); CREATE TABLE "Booking" (id text); INSERT INTO "Service" VALUES (\'service\',\'keep-this-link\'); INSERT INTO "Booking" VALUES (\'booking\');');
    await db.exec(readFileSync("prisma/migrations/20261014010000_simpler_sessions/migration.sql", "utf8"));
    const service = (await db.query<RecordData>('SELECT * FROM "Service"')).rows[0];
    assert.equal(service.slug, "keep-this-link");
    assert.equal(service.isOneOff, false);
    assert.equal(service.priceCents, null);
    assert.equal((await db.query<RecordData>('SELECT * FROM "Booking"')).rows[0].isManual, false);
  } finally { await db.close(); }
});
