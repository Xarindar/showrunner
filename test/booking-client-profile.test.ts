import * as sessionOffering from "../lib/scheduling/session-offering";
import * as timeFrames from "../lib/scheduling/service-time-frame";
import * as bookingDocuments from "../lib/scheduling/booking-documents";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeClientStatusSettings } from "../lib/clients/status-settings";
import { isRecord } from "../lib/objects";

type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };
function harness(options: { existing?: boolean; failBooking?: boolean; conflict?: boolean; documents?: bookingDocuments.BookingDocument[]; changedDocuments?: boolean } = {}) {
  const committed: Query[] = [];
  const writes: Query[] = [];
  const bookingWrites: Query[] = [];
  const settingQueries: Query[] = [];
  const serviceQueries: Query[] = [];
  const existing = { id: "client-a", name: "Saved name", phone: "Saved phone", preferences: { notes: "Keep notes", serviceId: "old-service" } };
  const service = { id: "portrait", siteId: "jazzr", name: "Portrait session", isActive: true, durationMinutes: 60, slotIntervalMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, resourceAssignments: [], staffAssignments: [] };
  const tx = {
    service: {findFirst:async()=>service},
    client: {
      findUnique: async () => options.existing ? existing : null,
      create: async (query: Query) => { writes.push(query); return { id: "client-a" }; },
      update: async (query: Query) => { writes.push(query); return existing; }
    },
    moduleSetting: { findUnique: async (query: Query) => { settingQueries.push(query); return { value: { options: [{ value: "session_booked", label: "Session booked" }, { value: "session_paid", label: "Session paid" }], defaultStatus: "session_booked" } }; } },
    booking: {
      findFirst: async () => options.conflict ? { id: "taken" } : null,
      create: async (query: Query) => { if (options.failBooking) throw new Error("Booking failed"); bookingWrites.push(query); return { id: "booking-a", ...query.data }; }
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
  const native = load("../lib/scheduling/native.ts", { "./session-offering": sessionOffering, "./service-time-frame": timeFrames, "./booking-documents": bookingDocuments, "./booking-document-store": {listBookingDocuments:async(_siteId:string,transaction?:unknown)=>transaction&&options.changedDocuments ? (options.documents??[]).map(doc=>({...doc,version:doc.version+1})) : options.documents??[]}, "server-only": {}, "@/lib/clients/public-client": client, "@/lib/email": { queueBookingCreatedEmails: async () => {} }, "@/lib/prisma": { prisma: db }, "@/lib/scheduling/google-calendar": {}, "@/lib/site": {}, "@/lib/timezone": {} });
  const adapter = native.nativeSchedulingAdapter as { getAvailableSlots: () => Promise<unknown[]>; createBooking: (input: unknown) => Promise<{ clientId: string; serviceId: string }> };
  const startsAt = new Date("2030-05-01T15:00:00Z");
  adapter.getAvailableSlots = async () => [{ startsAt, endsAt: new Date("2030-05-01T16:00:00Z"), resourceIds: [] }];
  const book = (extra:Record<string,unknown>={}) => adapter.createBooking({ siteId: "jazzr", serviceId: "portrait", startsAt, customerName: "New client", customerEmail: "CLIENT@EXAMPLE.COM", customerPhone: "12345", ...extra });
  return { book, committed, writes, settingQueries, serviceQueries, bookingWrites };
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


test("public bookings require effective document answers and acceptance, and retain the agreed version",async()=>{
 const question={id:"style",kind:"intake" as const,category:"Portraits",label:"Preferred style",type:"RADIO" as const,required:true,placeholder:"",helpText:"",options:["Candid","Posed"]};
 const terms={...question,id:"terms",kind:"policy" as const,label:"Accepted studio terms",type:"TEXT" as const,options:[]};
 const documents:bookingDocuments.BookingDocument[]=[{id:"form",name:"Portrait preparation",kind:"INTAKE",version:1,isDefault:true,rules:[question]},{id:"terms",name:"Studio terms",kind:"TERMS",version:2,isDefault:true,rules:[terms]}];
 const requirements=bookingDocuments.resolveBookingRequirements({},documents);
 const app=harness({documents});
 await assert.rejects(app.book(),/changed/);
 await assert.rejects(app.book({bookingRequirementsRevision:requirements.revision}),/agree/);
 await assert.rejects(app.book({bookingRequirementsRevision:requirements.revision,policyAccepted:true}),/Preferred style/);
 assert.equal(app.writes.length,0);
 const answers={[requirements.rules[0].id]:"Candid"};
 await app.book({bookingRequirementsRevision:requirements.revision,policyAccepted:true,intakeAnswers:answers});
 const snapshot=app.bookingWrites[0].data!.bookingRequirementsSnapshot as {documents:bookingDocuments.BookingDocument[];rules:typeof terms[];answers:Record<string,string>;acceptedAt:string};
 assert.equal(snapshot.documents[1].version,2);assert.equal(snapshot.rules[1].label,terms.label);
 assert.equal(snapshot.answers[requirements.rules[0].id],"Candid");assert(snapshot.acceptedAt);
 const changed=harness({documents,changedDocuments:true});
 await assert.rejects(changed.book({bookingRequirementsRevision:requirements.revision,policyAccepted:true,intakeAnswers:answers}),/changed/);
 assert.equal(changed.writes.length,0,'Terms changed during availability cannot commit a booking or client');
});
