import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeClientStatusSettings } from "../lib/clients/status-settings";
import { isRecord } from "../lib/objects";

type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };
function harness(options: { existing?: boolean; failBooking?: boolean; conflict?: boolean } = {}) {
  const committed: Query[] = [];
  const writes: Query[] = [];
  const settingQueries: Query[] = [];
  const serviceQueries: Query[] = [];
  const existing = { id: "client-a", name: "Saved name", phone: "Saved phone", preferences: { notes: "Keep notes", serviceId: "old-service" } };
  const service = { id: "portrait", siteId: "jazzr", name: "Portrait session", isActive: true, durationMinutes: 60, slotIntervalMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, resourceAssignments: [], staffAssignments: [] };
  const tx = {
    client: {
      findUnique: async () => options.existing ? existing : null,
      create: async (query: Query) => { writes.push(query); return { id: "client-a" }; },
      update: async (query: Query) => { writes.push(query); return existing; }
    },
    moduleSetting: { findUnique: async (query: Query) => { settingQueries.push(query); return { value: { options: [{ value: "session_booked", label: "Session booked" }, { value: "session_paid", label: "Session paid" }], defaultStatus: "session_booked" } }; } },
    booking: {
      findFirst: async () => options.conflict ? { id: "taken" } : null,
      create: async (query: Query) => { if (options.failBooking) throw new Error("Booking failed"); return { id: "booking-a", ...query.data }; }
    },
    blockedTime: { findFirst: async () => null }
  };
  const db = {
    service: { findFirst: async (query: Query) => { serviceQueries.push(query); return service; } },
    $transaction: async (callback: (db: typeof tx) => Promise<unknown>) => { const result = await callback(tx); committed.push(...writes); return result; }
  };
  const require = createRequire(import.meta.url);
  function load(path: string, mocks: Record<string, unknown>) {
    const exports: Record<string, unknown> = {};
    const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, require: (id: string) => id in mocks ? mocks[id] : require(id), Date, Error, console });
    return exports;
  }
  const client = load("../lib/clients/public-client.ts", { "server-only": {}, "@/lib/objects": { isRecord }, "@/lib/clients/status-settings": { normalizeClientStatusSettings } });
  const native = load("../lib/scheduling/native.ts", { "server-only": {}, "@/lib/clients/public-client": client, "@/lib/email": { queueBookingCreatedEmails: async () => {} }, "@/lib/prisma": { prisma: db }, "@/lib/scheduling/google-calendar": {}, "@/lib/site": {}, "@/lib/timezone": {} });
  const adapter = native.nativeSchedulingAdapter as { getAvailableSlots: () => Promise<unknown[]>; createBooking: (input: unknown) => Promise<{ clientId: string; serviceId: string }> };
  const startsAt = new Date("2030-05-01T15:00:00Z");
  adapter.getAvailableSlots = async () => [{ startsAt, resourceIds: [] }];
  const book = () => adapter.createBooking({ siteId: "jazzr", serviceId: "portrait", startsAt, customerName: "New client", customerEmail: "CLIENT@EXAMPLE.COM", customerPhone: "12345" });
  return { book, committed, writes, settingQueries, serviceQueries };
}

test("session booking creates a site-scoped profile with collected details, service and configured status", async () => {
  const app = harness();
  const booking = await app.book();
  assert.equal(booking.clientId, "client-a");
  assert.equal(booking.serviceId, "portrait");
  const client = app.committed[0].data!;
  assert.equal(client.siteId, "jazzr");
  assert.equal(client.email, "client@example.com");
  assert.equal(client.name, "New client");
  assert.equal(client.phone, "12345");
  assert.equal(client.status, "session_booked");
  assert.equal((client.preferences as { serviceId: string }).serviceId, "portrait");
  assert.equal(JSON.stringify(app.settingQueries[0].where), JSON.stringify({ siteId_moduleId_key: { siteId: "jazzr", moduleId: "clients", key: "statuses" } }));
  assert.equal(app.serviceQueries[0].where?.siteId, "jazzr");
});

test("repeat clients retain saved contact details and notes while their booked service updates", async () => {
  const app = harness({ existing: true });
  await app.book();
  const data = app.committed[0].data!;
  assert.equal(data.name, undefined);
  assert.equal(data.phone, undefined);
  assert.equal(data.status, undefined);
  assert.equal((data.preferences as { notes: string }).notes, "Keep notes");
  assert.equal((data.preferences as { serviceId: string }).serviceId, "portrait");
});

test("conflicting or failed bookings cannot commit a partial client profile", async () => {
  const conflict = harness({ conflict: true });
  await assert.rejects(conflict.book(), /booked or blocked/);
  assert.equal(conflict.writes.length, 0);
  const failed = harness({ failBooking: true });
  await assert.rejects(failed.book(), /Booking failed/);
  assert.equal(failed.committed.length, 0);
});
