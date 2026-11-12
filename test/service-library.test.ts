import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { resolveIncludedServices, serviceLibraryInputSchema, serviceLibraryItemSchema } from "../lib/scheduling/service-library";
import { priceSessionOffering, sessionOfferingDraft, sessionOfferingFormSchema, sessionOfferingSchema, sessionPackageSnapshotSchema, selectSessionPackage, suggestedSessionAddOns } from "../lib/scheduling/session-offering";

const offering = { coverageItems: [{ id: "legacy-ceremony", name: "Ceremony" }], tiers: [{ id: "standard", name: "Standard", durationMinutes: 60, priceCents: 10000, coverageIds: ["legacy-ceremony"] }], addOns: [] };
const item = { id: "library-ceremony", name: "Ceremony", description: "Your ceremony photographed from arrival to your first kiss.", category: "Weddings", tags: ["ceremony"], pricingType: "FLAT_RATE" as const, priceCents: null, hourlyRateId: null };

test("library input trims metadata, normalizes tags, and bounds client-facing descriptions", () => {
  const parsed = serviceLibraryInputSchema.parse({ name: " Ceremony ", description: " For clients. ", category: " Weddings ", tags: "Wedding, ceremony, WEDDING, " });
  assert.deepEqual(parsed, { name: "Ceremony", description: "For clients.", category: "Weddings", tags: ["wedding", "ceremony"], pricingType: "FLAT_RATE", priceCents: null, hourlyRateId: null });
  for (const value of [{ ...parsed, name: " ", tags: "" }, { ...parsed, description: "x".repeat(2001), tags: "" }, { ...parsed, tags: "x".repeat(61) }]) assert.equal(serviceLibraryInputSchema.safeParse(value).success, false);
});

test("library resolution preserves package references and uses authoritative service metadata", () => {
  const linked = resolveIncludedServices(offering, [item]);
  assert.equal(linked.coverageItems[0].id, "legacy-ceremony");
  assert.deepEqual(linked.tiers[0].coverageIds, ["legacy-ceremony"]);
  const forged = { ...linked, coverageItems: [{ ...linked.coverageItems[0], name: "Forged", description: "Forged" }] };
  const resolved = resolveIncludedServices(forged, [item]);
  assert.equal(resolved.coverageItems[0].description, item.description);
  assert.equal(resolved.coverageItems[0].name, item.name);
  assert.throws(() => resolveIncludedServices(linked, []), /no longer available/, "foreign-site or deleted references cannot resolve");
  assert.equal(sessionOfferingSchema.safeParse({ ...linked, coverageItems: [linked.coverageItems[0], { ...linked.coverageItems[0], id: "another", name: "Another" }] }).success, false);
  assert.deepEqual(sessionOfferingFormSchema.parse(JSON.stringify(sessionOfferingDraft(linked, 60, null))), linked);
  const snapshot = selectSessionPackage(linked, "standard");
  assert.deepEqual(snapshot?.includedItems, [{ name: item.name, description: item.description, pricingType: "FLAT_RATE", priceCents: null, hourlyRateId: null }]);
  linked.coverageItems[0].description = "Changed after booking";
  assert.equal(snapshot?.includedItems?.[0].description, item.description);
});

test("add-on availability is optional, explicit, and clears disabled prices", () => {
  const base = { name: "First look", description: "", category: "", tags: "" };
  assert.equal(serviceLibraryInputSchema.parse({ ...base, availableAsAddOn: false, price: "bad", pricingType: "HOURLY" }).priceCents, null);
  assert.equal(serviceLibraryInputSchema.safeParse({ ...base, availableAsAddOn: true, price: "" }).success, false);
  assert.equal(serviceLibraryInputSchema.parse({ ...base, availableAsAddOn: true, price: "0" }).priceCents, 0);
  assert.equal(serviceLibraryInputSchema.parse({ ...base, availableAsAddOn: true, price: "125.50" }).priceCents, 12550);
});

test("suggested add-ons use authoritative prices and never charge included services", () => {
  const selected = { ...offering, coverageItems: [], tiers: offering.tiers.map(tier => ({ ...tier, coverageIds: [] })), addOns: [{ id: "optional", libraryItemId: item.id, name: "Forged name", priceCents: 1 }, { id: "legacy", name: "Existing extra", priceCents: 2500 }] };
  const resolved = resolveIncludedServices(selected, [{ ...item, priceCents: 5000 }]);
  const roundTrip = sessionOfferingFormSchema.parse(JSON.stringify(sessionOfferingDraft(resolved, 60, null)));
  assert.deepEqual(roundTrip.addOns, resolved.addOns);
  assert.equal(selectSessionPackage(roundTrip, "standard")?.priceCents, 10000);
  const snapshot = selectSessionPackage(roundTrip, "standard", ["optional"]);
  assert.equal(snapshot?.priceCents, 15000);
  assert.equal(snapshot?.extras[0].name, item.name);
  assert.equal(selectSessionPackage(roundTrip, "standard", ["legacy"])?.priceCents, 12500);
  assert.equal(resolveIncludedServices(selected, [{ ...item, priceCents: 0 }]).addOns[0].priceCents, 0);
  assert.throws(() => resolveIncludedServices(selected, [item]), /no longer available as an add-on/);
  assert.throws(() => resolveIncludedServices(selected, []), /no longer available/);
  const included = resolveIncludedServices({ ...offering, addOns: selected.addOns }, [{ ...item, priceCents: 5000 }]);
  assert.deepEqual(suggestedSessionAddOns(included, "standard").map(extra => extra.id), ["legacy"]);
  assert.throws(() => selectSessionPackage(included, "standard", ["optional"]), /available extras/);
  assert.equal(selectSessionPackage(included, "standard")?.priceCents, 10000);
  resolved.addOns[0].priceCents = 9000;
  assert.equal(snapshot?.priceCents, 15000, "Previously booked snapshots keep the agreed price");
  const hourly = priceSessionOffering(resolveIncludedServices(selected, [{ ...item, pricingType: "HOURLY", hourlyRateId: "rate" }]), [{ id: "rate", name: "Coverage", amountCents: 10000 }], { pricingType: "FLAT_RATE", hourlyRateId: "" });
  assert.equal(selectSessionPackage(hourly, "standard", ["optional"], 90)?.priceCents, 25000);
  assert.throws(() => priceSessionOffering(hourly, [], { pricingType: "FLAT_RATE", hourlyRateId: "" }), /from this business/);
  assert.throws(() => selectSessionPackage({ ...resolved, tiers: [{ ...resolved.tiers[0], priceCents: 999999999 }] }, "standard", ["optional"]), /less/);
});

test("optional-only offerings hydrate library references within the current site", async () => {
  const exports: Record<string, (offering: unknown, siteId: string) => Promise<unknown>> = {};
  let queries = 0;
  runInNewContext(ts.transpileModule(readFileSync("lib/scheduling/service-library-store.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: (id: string) => {
    if (id === "server-only") return {};
    if (id === "./service-library") return { resolveIncludedServices, serviceLibraryItemSchema };
    if (id === "@/lib/prisma") return { prisma: { serviceLibraryItem: { findMany: async ({ where }: { where: { siteId: string; OR: Array<{ id?: { in: string[] } }> } }) => {
      queries++;
      assert.equal(where.siteId, "site-a");
      assert.deepEqual(Array.from(where.OR[0].id!.in), [item.id]);
      return [{ ...item, priceCents: 5000 }];
    } } } };
    throw new Error(`Unexpected import ${id}`);
  } });
  const selected = { ...offering, coverageItems: [], tiers: offering.tiers.map(tier => ({ ...tier, coverageIds: [] })), addOns: [{ id: "extra", libraryItemId: item.id, name: "Forged", priceCents: 1 }] };
  const resolved = await exports.hydrateSessionServiceLibrary(selected, "site-a") as typeof selected;
  assert.equal(queries, 1);
  assert.equal(resolved.addOns[0].priceCents, 5000);
  assert.equal(resolved.addOns[0].name, item.name);
});

test("library migration imports legacy names by site without changing session JSON or selections", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Site" (id TEXT PRIMARY KEY); CREATE TABLE "Service" (id TEXT PRIMARY KEY, "siteId" TEXT, "sessionOffering" JSONB); INSERT INTO "Site" VALUES (\'one\'), (\'two\');');
    await db.query('INSERT INTO "Service" VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9)', ["a", "one", offering, "b", "one", { ...offering, coverageItems: [{ id: "other", name: " ceremony " }] }, "c", "two", offering]);
    await db.exec(readFileSync("prisma/migrations/20261016010000_service_library/migration.sql", "utf8"));
    const rows = await db.query('SELECT "siteId", name, "nameKey", description, category, tags FROM "ServiceLibraryItem" ORDER BY "siteId"');
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(rows.rows[0], { siteId: "one", name: "Ceremony", nameKey: "ceremony", description: "", category: "", tags: [] });
    assert.deepEqual((await db.query('SELECT "sessionOffering" FROM "Service" WHERE id=\'a\'')).rows[0], { sessionOffering: offering });
    await assert.rejects(db.exec('INSERT INTO "ServiceLibraryItem" (id,"siteId",name,"nameKey","updatedAt") VALUES (\'duplicate\',\'one\',\'ceremony\',\'ceremony\',CURRENT_TIMESTAMP)'), /unique/i);
  } finally { await db.close(); }
});

test("per-unit add-ons retain unit costs, multiply quantities and snapshot the agreed amount", () => {
  const saved = serviceLibraryInputSchema.parse({ name: "Extra photos", description: "", category: "", tags: "", availableAsAddOn: true, pricingType: "PER_UNIT", price: "3.00" });
  assert.equal(saved.priceCents, 300);
  assert.equal(saved.pricingType, "PER_UNIT");
  assert.equal(saved.hourlyRateId, null);
  assert.equal(serviceLibraryInputSchema.safeParse({ ...saved, tags: "", availableAsAddOn: true, price: "" }).success, false);
  const perUnit = { ...offering, coverageItems: [], tiers: offering.tiers.map(tier => ({ ...tier, coverageIds: [] })), addOns: [{ id: "photos", name: "Extra photos", pricingType: "PER_UNIT" as const, priceCents: 300 }] };
  const roundTrip = sessionOfferingFormSchema.parse(JSON.stringify(sessionOfferingDraft(perUnit, 60, null)));
  const snapshot = selectSessionPackage(roundTrip, "standard", ["photos"], undefined, { photos: 10 });
  assert.equal(snapshot?.priceCents, 13000);
  assert.deepEqual(sessionPackageSnapshotSchema.parse(snapshot).extras, snapshot?.extras);
  assert.deepEqual(snapshot?.extras, [{ name: "Extra photos", priceCents: 3000, pricingType: "PER_UNIT", quantity: 10, unitPriceCents: 300 }]);
  assert.equal(selectSessionPackage(roundTrip, "standard", ["photos"])?.priceCents, 10300);
  for (const quantity of [0, -1, 1.5, 10001]) assert.throws(() => selectSessionPackage(roundTrip, "standard", ["photos"], undefined, { photos: quantity }));
  assert.throws(() => selectSessionPackage(roundTrip, "standard", [], undefined, { photos: 10 }), /selected add-ons/);
  assert.throws(() => selectSessionPackage({ ...perUnit, addOns: [{ ...perUnit.addOns[0], pricingType: "FLAT_RATE" }] }, "standard", ["photos"], undefined, { photos: 10 }), /quantity/);
  assert.throws(() => selectSessionPackage({ ...perUnit, addOns: [{ ...perUnit.addOns[0], priceCents: 999999999 }] }, "standard", ["photos"], undefined, { photos: 2 }), /less/);
  perUnit.addOns[0].priceCents = 500;
  assert.equal(snapshot?.extras[0].unitPriceCents, 300);
});

test("per-unit library migration preserves existing flat and hourly pricing", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE "ServicePricingType" AS ENUM ('FLAT_RATE', 'HOURLY'); CREATE TABLE "ServiceLibraryItem" (id TEXT PRIMARY KEY, "pricingType" "ServicePricingType" NOT NULL DEFAULT 'FLAT_RATE'); INSERT INTO "ServiceLibraryItem" VALUES ('flat','FLAT_RATE'),('hourly','HOURLY');`);
    await db.exec(readFileSync("prisma/migrations/20261107010000_per_unit_add_ons/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "ServiceLibraryItem" VALUES ('per-unit','PER_UNIT'); INSERT INTO "ServiceLibraryItem" (id) VALUES ('default');`);
    assert.deepEqual((await db.query('SELECT id, "pricingType" FROM "ServiceLibraryItem" ORDER BY id')).rows, [{ id: "default", pricingType: "FLAT_RATE" }, { id: "flat", pricingType: "FLAT_RATE" }, { id: "hourly", pricingType: "HOURLY" }, { id: "per-unit", pricingType: "PER_UNIT" }]);
  } finally { await db.close(); }
});


test("reusable service effects survive library hydration, editing and form round trips", () => {
  const saved = serviceLibraryInputSchema.parse({ name: "Custom upgrade", description: "", category: "", tags: "", availableAsAddOn: true, pricingType: "PER_UNIT", price: "8.50", deliverables: { finalPhotos: 1, locations: 2 } });
  assert.deepEqual(saved.deliverables, { finalPhotos: 1, locations: 2 });
  const linked = { ...offering, addOns: [{ id: "extra", libraryItemId: "saved-upgrade", name: "Old name", priceCents: 0 }] };
  const hydrated = resolveIncludedServices(sessionOfferingSchema.parse(linked), [{ ...saved, id: "saved-upgrade" }]);
  assert.deepEqual(hydrated.addOns[0].deliverables, { finalPhotos: 1, locations: 2 });
  assert.equal(hydrated.addOns[0].priceCents, 850);
  const roundTrip = sessionOfferingFormSchema.parse(JSON.stringify(sessionOfferingDraft(hydrated, 60, 10000)));
  assert.deepEqual(roundTrip.addOns[0].deliverables, { finalPhotos: 1, locations: 2 });
  assert.equal(serviceLibraryInputSchema.safeParse({ ...saved, deliverables: { finalPhotos: -1 } }).success, false);
});
