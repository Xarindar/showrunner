import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { serviceTimeFrameSchema } from "../lib/scheduling/service-time-frame";
import * as timeFrames from "../lib/scheduling/service-time-frame";
import * as offerings from "../lib/scheduling/session-offering";
import * as format from "../lib/format";

const offering = {
  coverageItems: [], addOns: [],
  tiers: [{ pricingType: "TIME_FRAME", timeFrame: { start: "13:00", end: "15:00" }, id: "standard", name: "Standard", durationMinutes: "60", price: "100.00", coverageIds: [] }]
};

test("time-frame package pricing validates and round-trips with derived duration and a fixed price", () => {
  for (const frame of [{ start: "15:00", end: "13:00" }, { start: "13:00", end: "13:00" }, { start: "25:00", end: "26:00" }, { start: "", end: "15:00" }]) {
    assert.equal(serviceTimeFrameSchema.safeParse(frame).success, false);
    assert.equal(offerings.sessionOfferingFormSchema.safeParse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], timeFrame: frame }] })).success, false);
  }
  const saved = offerings.sessionOfferingFormSchema.parse(JSON.stringify(offering));
  assert.equal(saved.tiers[0].durationMinutes, 120);
  assert.deepEqual(offerings.sessionOfferingDraft(saved, 60, null).tiers[0].timeFrame, offering.tiers[0].timeFrame);
  const priced = offerings.priceSessionOffering(saved, [{ id: "rate", name: "Hourly", amountCents: 5000 }], { pricingType: "HOURLY", hourlyRateId: "rate" });
  assert.equal(priced.tiers[0].priceCents, 10000);
  assert.equal(priced.tiers[0].pricingType, "TIME_FRAME");
  assert.deepEqual(offerings.readSessionOffering(priced)?.tiers[0].timeFrame, offering.tiers[0].timeFrame);
  const legacy = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], pricingType: "FLAT_RATE", timeFrame: undefined }] }));
  assert.equal(legacy.tiers[0].durationMinutes, 60);
  assert.equal(legacy.tiers[0].timeFrame, undefined);
});

function harness() {
  const require = createRequire(import.meta.url);
  const timezone = {};
  runInNewContext(ts.transpileModule(readFileSync("lib/timezone.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: timezone, Date, Intl, require: (id: string) => id === "server-only" ? {} : require(id) });
  const state = {
    service: { id: "service", siteId: "site", name: "Afternoon", isActive: true, durationMinutes: 120, slotIntervalMinutes: 30,
      minimumNoticeHours: 0, maxAdvanceDays: 3650, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
      staffAssignments: [], resourceAssignments: [], sessionOffering: offerings.sessionOfferingFormSchema.parse(JSON.stringify(offering)) as unknown },
    rules: [{ startMinutes: 540, endMinutes: 1020 }] as Array<{ weekday?: number; startMinutes: number; endMinutes: number }>,
    queryEnds: [] as Date[],
    bookings: [] as Array<{ startsAt: Date; endsAt: Date; staffId: null; resources: []; service: { resourceAssignments: [] } }>,
    blocks: [] as Array<{ startsAt: Date; endsAt: Date; staffId: null; resourceId: null }>
  };
  const settings = { siteId: "site", timezone: "America/Chicago" };
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/format": format, "@/lib/timezone": timezone,
    "./session-offering": offerings, "./service-time-frame": timeFrames,
    "@/lib/site": { getSiteSettings: async () => settings, getSiteSettingsForSite: async () => settings },
    "@/lib/scheduling/google-calendar": { listGoogleBusyWindows: async () => ({ busy: [] }) },
    "@/lib/prisma": { prisma: {
      service: { findFirst: async () => state.service }, availabilityRule: { findMany: async () => state.rules },
      booking: { findMany: async (query: { where: { startsAt: { lt: Date } } }) => { state.queryEnds.push(query.where.startsAt.lt); return state.bookings; } }, blockedTime: { findMany: async () => state.blocks }
    } }
  };
  const exports: { nativeSchedulingAdapter?: { getAvailableSlots: (id: string, date: Date) => Promise<Array<{ startsAt: Date; endsAt: Date; label: string }>> } } = {};
  const source = ts.transpileModule(readFileSync("lib/scheduling/native.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, Date, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") || id.startsWith("./") ? {} : require(id) });
  return { state, adapter: exports.nativeSchedulingAdapter! };
}

test("fixed windows offer only the entire window and still obey hours, bookings and closures", async () => {
  const h = harness();
  const date = new Date("2030-11-12T18:00:00Z");
  const slots = await h.adapter.getAvailableSlots("service", date);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startsAt.toISOString(), "2030-11-12T19:00:00.000Z");
  assert.equal(slots[0].endsAt.toISOString(), "2030-11-12T21:00:00.000Z");
  assert.match(slots[0].label, /1:00 PM.*3:00 PM/);
  h.state.rules = [{ startMinutes: 840, endMinutes: 1020 }];
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 0);
  h.state.rules = [{ startMinutes: 540, endMinutes: 840 }];
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 0);
  h.state.rules = [{ startMinutes: 540, endMinutes: 1020 }];
  h.state.bookings = [{ startsAt: new Date("2030-11-12T20:00:00Z"), endsAt: new Date("2030-11-12T20:30:00Z"), staffId: null, resources: [], service: { resourceAssignments: [] } }];
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 0);
  h.state.bookings = [];
  h.state.blocks = [{ startsAt: slots[0].startsAt, endsAt: slots[0].endsAt, staffId: null, resourceId: null }];
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 0);
  h.state.blocks = [];
  h.state.service.sessionOffering = null;
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 13);
});

test("fixed-window end time stays on the business clock across daylight saving", async () => {
  const h = harness();
  h.state.service.sessionOffering = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], timeFrame: { start: "01:00", end: "03:00" } }] }));
  h.state.rules = [{ startMinutes: 0, endMinutes: 300 }];
  const slots = await h.adapter.getAvailableSlots("service", new Date("2030-03-10T12:00:00Z"));
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startsAt.toISOString(), "2030-03-10T07:00:00.000Z");
  assert.equal(slots[0].endsAt.toISOString(), "2030-03-10T08:00:00.000Z");
});


test("packages keep independent time frames, pricing types and booked snapshots", () => {
  const saved = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [
    offering.tiers[0],
    { ...offering.tiers[0], id: "evening", name: "Evening", timeFrame: { start: "17:00", end: "20:00" }, price: "250" },
    { ...offering.tiers[0], id: "hourly", name: "Hourly", pricingType: "HOURLY", hourlyRateId: "rate", timeFrame: undefined }
  ] }));
  assert.deepEqual(saved.tiers.map(tier => tier.durationMinutes), [120, 180, 60]);
  const priced = offerings.priceSessionOffering(saved, [{ id: "rate", name: "Rate", amountCents: 5000 }], { pricingType: "FLAT_RATE", hourlyRateId: "" });
  assert.deepEqual(priced.tiers.map(tier => tier.priceCents), [10000, 25000, 5000]);
  const snapshot = offerings.sessionPackageSnapshotSchema.parse(offerings.selectSessionPackage(priced, "evening"));
  assert.equal(snapshot.pricingType, "TIME_FRAME");
  assert.deepEqual(snapshot.timeFrame, { start: "17:00", end: "20:00" });
  assert.throws(() => offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], timeFrame: undefined }] })), /start and end/);
  const previous = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, timeFrame: { start: "13:00", end: "15:00" }, tiers: [{ ...offering.tiers[0], pricingType: "FLAT_RATE", timeFrame: undefined }] }));
  assert.equal(previous.tiers[0].pricingType, "TIME_FRAME");
});


test("overnight intent is explicit and durations cross midnight without calendar dates", () => {
  const frame = { start: "22:00", end: "02:00", endsNextDay: true };
  const saved = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], timeFrame: frame }] }));
  assert.equal(saved.tiers[0].durationMinutes, 240);
  assert.deepEqual(offerings.sessionOfferingDraft(saved, 60, null).tiers[0].timeFrame, frame);
  assert.equal(serviceTimeFrameSchema.safeParse({ ...frame, endsNextDay: false }).success, false);
  assert.equal(serviceTimeFrameSchema.safeParse({ start: "12:00", end: "12:00", endsNextDay: true }).success, true);
  const longer = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], timeFrame: { start: "13:00", end: "15:00", endsNextDay: true } }] }));
  assert.equal(longer.tiers[0].durationMinutes, 1560);
});

test("overnight windows recur on available dates and check conflicts beyond midnight", async () => {
  const h = harness();
  h.state.service.sessionOffering = offerings.sessionOfferingFormSchema.parse(JSON.stringify({ ...offering, tiers: [{ ...offering.tiers[0], timeFrame: { start: "22:00", end: "02:00", endsNextDay: true } }] }));
  h.state.service.durationMinutes = 240;
  h.state.service.bufferAfterMinutes = 30;
  h.state.rules = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinutes: 0, endMinutes: 1440 }));
  const date = new Date("2030-11-12T18:00:00Z");
  const slots = await h.adapter.getAvailableSlots("service", date);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startsAt.toISOString(), "2030-11-13T04:00:00.000Z");
  assert.equal(slots[0].endsAt.toISOString(), "2030-11-13T08:00:00.000Z");
  assert.match(slots[0].label, /next day/);
  assert.equal(h.state.queryEnds[0].toISOString(), "2030-11-13T08:30:00.000Z");
  assert.equal((await h.adapter.getAvailableSlots("service", new Date("2030-11-13T18:00:00Z"))).length, 1);
  h.state.rules[3].startMinutes = 60;
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 0);
  h.state.rules[3].startMinutes = 0;
  h.state.bookings = [{ startsAt: new Date("2030-11-13T07:00:00Z"), endsAt: new Date("2030-11-13T07:30:00Z"), staffId: null, resources: [], service: { resourceAssignments: [] } }];
  assert.equal((await h.adapter.getAvailableSlots("service", date)).length, 0);
});

test("overnight availability rolls Saturday into Sunday and rejects gaps", () => {
  const days = timeFrames.timeFrameDays(serviceTimeFrameSchema.parse({ start: "22:00", end: "02:00", endsNextDay: true }), 6);
  assert.deepEqual(days, [{ weekday: 6, start: 1320, end: 1440 }, { weekday: 0, start: 0, end: 120 }]);
  const rules = [{ weekday: 6, startMinutes: 1320, endMinutes: 1440 }, { weekday: 0, startMinutes: 0, endMinutes: 120 }];
  assert.equal(timeFrames.timeFrameCovered(days, rules), true);
  assert.equal(timeFrames.timeFrameCovered(days, rules.slice(0, 1)), false);
});


test("editing clock times automatically selects next day across midnight and preserves explicit choices", () => {
  const frame = { start: "22:00", end: "23:00", endsNextDay: false };
  assert.equal(timeFrames.editTimeFrame(frame, { end: "00:00" }).endsNextDay, true);
  assert.equal(timeFrames.editTimeFrame(frame, { end: "02:00" }).endsNextDay, true);
  assert.equal(timeFrames.editTimeFrame(frame, { end: "22:00" }).endsNextDay, true);
  assert.equal(timeFrames.editTimeFrame(frame, { end: "23:30" }).endsNextDay, false);
  assert.equal(timeFrames.editTimeFrame({ ...frame, endsNextDay: true }, { end: "23:30" }).endsNextDay, true);
  assert.equal(timeFrames.editTimeFrame({ start: "09:00", end: "17:00" }, { start: "22:00" }).endsNextDay, true);
  assert.equal(timeFrames.editTimeFrame(frame, { end: "" }).endsNextDay, false);
});
