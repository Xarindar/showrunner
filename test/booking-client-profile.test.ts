import * as sessionOffering from "../lib/scheduling/session-offering";
import * as timeFrames from "../lib/scheduling/service-time-frame";
import * as bookingDocuments from "../lib/scheduling/booking-documents";
import { bookingRuleSchema } from "../lib/scheduling/booking-rules";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeClientStatusSettings } from "../lib/clients/status-settings";
import { isRecord } from "../lib/objects";

type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };
function harness(options: { hourly?: boolean; existing?: boolean; existingCompany?: string; failBooking?: boolean; conflict?: boolean; documents?: bookingDocuments.BookingDocument[]; changedDocuments?: boolean } = {}) {
  const committed: Query[] = [];
  const writes: Query[] = [];
  const bookingWrites: Query[] = [];
  const settingQueries: Query[] = [];
  const serviceQueries: Query[] = [];
  const existing = { id: "client-a", name: "Saved name", phone: "Saved phone", companyName: options.existingCompany || "", preferences: { notes: "Keep notes", serviceId: "old-service" } };
  const service = { id: "portrait", siteId: "jazzr", name: "Portrait session", isActive: true, durationMinutes: 60, slotIntervalMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, resourceAssignments: [], staffAssignments: [] };
  const rates = [{ id: "venue", name: "Venue", amountCents: 10000 }, { id: "help", name: "Assistant", amountCents: 2000 }];
  if (options.hourly) Object.assign(service, { pricingType: "HOURLY", hourlyRateId: "venue", hourlyRate: rates[0], sessionOffering: {
    coverageItems: [], tiers: [{ id: "hourly", name: "Hourly", pricingType: "HOURLY", hourlyRateId: "venue", durationMinutes: 60, priceCents: 10000, coverageIds: [] }],
    addOns: [{ id: "assistant", name: "Assistant", pricingType: "HOURLY", hourlyRateId: "help", priceCents: 2000 }]
  } });
  const invoices: Query[] = [];
  let emails = 0;
  const tx = {
    billingDocument: { create: async (query: Query) => { invoices.push(query); } },
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
    hourlyRate: { findMany: async () => rates },
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
  const native = load("../lib/scheduling/native.ts", { "./session-offering": sessionOffering, "./service-time-frame": timeFrames, "./booking-documents": bookingDocuments, "./booking-document-store": {listBookingDocuments:async(_siteId:string,transaction?:unknown)=>transaction&&options.changedDocuments ? (options.documents??[]).map(doc=>({...doc,version:doc.version+1})) : options.documents??[]}, "server-only": {}, "@/lib/clients/public-client": client, "@/lib/email": { queueBookingCreatedEmails: async () => { emails++; } }, "@/lib/billing/documents": { generateBillingPublicToken: () => "payment-token" }, "@/lib/prisma": { prisma: db }, "@/lib/scheduling/google-calendar": {}, "@/lib/site": {getSiteSettingsForSite:async()=>({timezone:"America/Chicago"})}, "@/lib/timezone": {} });
  const adapter = native.nativeSchedulingAdapter as { getAvailableSlots: () => Promise<unknown[]>; createBooking: (input: unknown) => Promise<{ clientId: string; serviceId: string; paymentToken?: string }> };
  const startsAt = new Date("2030-05-01T15:00:00Z");
  adapter.getAvailableSlots = async (...args: unknown[]) => [{ startsAt, endsAt: new Date(startsAt.getTime() + ((args[2] as { durationMinutes?: number } | undefined)?.durationMinutes ?? 60) * 60000), resourceIds: [] }];
  const book = (extra:Record<string,unknown>={}) => adapter.createBooking({ siteId: "jazzr", serviceId: "portrait", startsAt, customerName: "New client", customerEmail: "CLIENT@EXAMPLE.COM", customerPhone: "12345", ...extra });
  return { book, service, committed, writes, settingQueries, serviceQueries, bookingWrites, invoices, get emails() { return emails; } };
}

test("public hourly bookings validate customer duration and price hourly add-ons for the full reserved length", async () => {
  const app = harness({ hourly: true });
  await assert.rejects(app.book({ tierId: "hourly" }));
  assert.equal(app.bookingWrites.length, 0);
  await app.book({ tierId: "hourly", durationMinutes: 150, addOnIds: ["assistant"] });
  const data = app.bookingWrites[0].data as { priceCents: number; startsAt: Date; endsAt: Date; packageSnapshot: { durationMinutes: number; hourlyRate: { amountCents: number }; extras: Array<{ priceCents: number }> } };
  assert.equal(data.priceCents, 30000);
  assert.equal(data.endsAt.getTime() - data.startsAt.getTime(), 150 * 60000);
  assert.equal(data.packageSnapshot.durationMinutes, 150);
  assert.equal(data.packageSnapshot.hourlyRate.amountCents, 10000);
  assert.equal(data.packageSnapshot.extras[0].priceCents, 5000);
});

test("paid booking reserves a slot with the computed total and defers confirmation and request checkout", async () => {
  const app = harness({ hourly: true });
  const booking = { tierId: "hourly", durationMinutes: 150, addOnIds: ["assistant"] };
  await assert.rejects(app.book({ ...booking, onlinePayment: { checkoutSupported: false } }), /current checkout/);
  assert.equal(app.bookingWrites.length, 0);

  const onlinePayment = { checkoutSupported: true };
  assert.equal((await app.book({ ...booking, onlinePayment })).paymentToken, "payment-token");
  assert.equal(app.bookingWrites[0].data?.status, "PENDING");
  assert.equal(app.invoices[0].data?.totalCents, 30000);
  assert.equal(app.invoices[0].data?.bookingId, "booking-a");
  assert.equal(app.invoices[0].data?.status, "SENT");
  assert.equal(app.emails, 0);

  const request = harness({ hourly: true });
  Object.assign(request.service, { requestOnly: true });
  assert.equal((await request.book({ ...booking, onlinePayment })).paymentToken, undefined);
  assert.equal(request.invoices[0].data?.status, "DRAFT");
  assert.equal(request.invoices[0].data?.bookingApprovalRequired, true);
  assert.equal(request.emails, 1);
});

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
 await app.book({bookingRequirementsRevision:requirements.revision,policyAccepted:true,intakeAnswers:answers,photoMarketingConsent:false,sessionLocation:"12 Main St, Chicago, Illinois 60601"});
 assert.equal(app.bookingWrites[0].data!.sessionLocation,"12 Main St, Chicago, Illinois 60601");
 const snapshot=app.bookingWrites[0].data!.bookingRequirementsSnapshot as {documents:bookingDocuments.BookingDocument[];rules:typeof terms[];answers:Record<string,string>;acceptedAt:string;photoMarketingConsent:boolean};
 assert.equal(snapshot.photoMarketingConsent,false);
 assert.equal(snapshot.documents[1].version,2);assert.equal(snapshot.rules[1].label,terms.label);
 assert.equal(snapshot.answers[requirements.rules[0].id],"Candid");assert(snapshot.acceptedAt);
 const changed=harness({documents,changedDocuments:true});
 await assert.rejects(changed.book({bookingRequirementsRevision:requirements.revision,policyAccepted:true,intakeAnswers:answers}),/changed/);
 assert.equal(changed.writes.length,0,'Terms changed during availability cannot commit a booking or client');
});


test("booking company is optional, fills blank client companies and preserves saved companies", async () => {
  const added = harness();
  await added.book({ customerCompany: "  Client Studio  " });
  assert.equal(added.committed[0].data!.companyName, "Client Studio");
  const blank = harness({ existing: true });
  await blank.book({ customerCompany: "Client Studio" });
  assert.equal(blank.committed[0].data!.companyName, "Client Studio");
  const saved = harness({ existing: true, existingCompany: "Saved Company" });
  await saved.book({ customerCompany: "Another Company" });
  assert.equal(saved.committed[0].data!.companyName, undefined);
  const omitted = harness();
  await omitted.book();
  assert.equal(omitted.committed[0].data!.companyName, "");
});


test("public bookings persist the selected tier and server-priced extras, including unlimited photos",async()=>{
  const h=harness();
  Object.assign(h.service,{sessionOffering:{coverageItems:[],tiers:[
    {id:"basic",name:"Basic",durationMinutes:60,priceCents:10000,coverageIds:[]},
    {id:"gold",name:"Gold",durationMinutes:120,priceCents:30000,coverageIds:[],deliverables:{finalPhotos:null}}],
    addOns:[{id:"prints",name:"Prints",priceCents:500,pricingType:"PER_UNIT"}]}});
  await assert.rejects(h.book(),/Choose a package/);
  await assert.rejects(h.book({tierId:"wrong"}),/Choose a package/);
  await assert.rejects(h.book({tierId:"gold",addOnIds:["foreign"]}),/available extras/);
  await h.book({tierId:"gold",addOnIds:["prints"],addOnQuantities:{prints:2},priceCents:1});
  const saved=h.bookingWrites[0].data;
  assert(saved);
  const snapshot=sessionOffering.sessionPackageSnapshotSchema.parse(saved.packageSnapshot);
  assert.equal(saved.priceCents,31000);
  assert.equal(snapshot.tierId,"gold");
  assert.equal(snapshot.deliverables?.finalPhotos,null);
  assert.equal(snapshot.extras[0].quantity,2);
});

test("rich terms must match the accepted text and are saved as immutable rendered copies",async()=>{
  const rule=bookingRuleSchema.parse({id:"terms",kind:"policy",category:"Terms",type:"TEXT",required:true,options:[],label:"[Client name] books [Package name] for [Booking total]",richText:{type:"doc",content:[{type:"paragraph",content:[{type:"dynamicField",attrs:{field:"clientName"}},{type:"text",text:" books "},{type:"dynamicField",attrs:{field:"packageName"}},{type:"text",text:" for "},{type:"dynamicField",attrs:{field:"total"}}]}]}});
  const document:bookingDocuments.BookingDocument={id:"terms",name:"Default",version:1,kind:"TERMS",isDefault:true,rules:[rule]};
  const h=harness({documents:[document]});
  Object.assign(h.service,{sessionOffering:{coverageItems:[],tiers:[{id:"gold",name:"Gold",durationMinutes:60,priceCents:30000,coverageIds:[]}],addOns:[]}});
  const input={tierId:"gold",policyAccepted:true,bookingRequirementsRevision:bookingDocuments.resolveBookingRequirements({...h.service,bookingDocumentSelection:undefined},[document]).revision};
  await assert.rejects(h.book({...input,acceptedTerms:"Old terms"}),/Review and accept/);
  assert.equal(h.bookingWrites.length,0);
  await h.book({...input,acceptedTerms:"New client books Gold for $300.00"});
  const saved=h.bookingWrites[0].data?.bookingRequirementsSnapshot as {renderedTerms:{text:string;html:string}};
  assert.equal(saved.renderedTerms.text,"New client books Gold for $300.00");
  document.rules[0].label="Changed later";
  assert.match(saved.renderedTerms.html,/Gold for \$300.00/);
});
