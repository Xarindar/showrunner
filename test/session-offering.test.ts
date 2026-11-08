import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { priceSessionOffering, sessionOfferingFormSchema, sessionOfferingDraft, sessionOfferingSchema, selectSessionPackage, sessionPackageSnapshotSchema } from "../lib/scheduling/session-offering";

test("blank optional hourly-rate selections round-trip for packages, included services and add-ons", () => {
  const saved = sessionOfferingFormSchema.parse(JSON.stringify({
    coverageItems: [{ id: "included", name: "Coverage", hourlyRateId: "" }],
    tiers: [{ id: "standard", name: "Standard", durationMinutes: "30", price: "", pricingType: "FLAT_RATE", hourlyRateId: "", coverageIds: ["included"] }],
    addOns: [{ id: "extra", name: "Prints", price: "25", hourlyRateId: "" }]
  }));
  assert.equal(saved.tiers[0].hourlyRateId, null);
  assert.equal(saved.coverageItems[0].hourlyRateId, null);
  assert.equal(saved.addOns[0].hourlyRateId, null);
  assert.equal(saved.tiers[0].priceCents, null);
  assert.equal(saved.addOns[0].priceCents, 2500);
  assert.throws(() => priceSessionOffering({ ...saved, tiers: [{ ...saved.tiers[0], pricingType: "HOURLY" }] }, [], { pricingType: "FLAT_RATE", hourlyRateId: "" }), /Choose an hourly rate/);
});

test("packages keep independent flat and hourly prices, validate rate ownership and retain legacy pricing", () => {
  const rates = [{ id: "rate", name: "Photography", amountCents: 12550 }];
  const fallback = { pricingType: "HOURLY" as const, hourlyRateId: "rate" };
  const mixed = { ...offering, tiers: [
    { ...offering.tiers[0], pricingType: "FLAT_RATE" as const },
    { ...offering.tiers[1], pricingType: "HOURLY" as const, hourlyRateId: "rate", durationMinutes: 90 }
  ] };
  const saved = priceSessionOffering(sessionOfferingFormSchema.parse(JSON.stringify(sessionOfferingDraft(mixed, 60, null))), rates, fallback);
  assert.equal(saved.tiers[0].priceCents, 200000);
  assert.equal(saved.tiers[0].hourlyRateId, null);
  assert.equal(saved.tiers[1].priceCents, 18825);
  assert.equal(saved.tiers[1].hourlyRateId, "rate");
  assert.throws(() => priceSessionOffering(mixed, [], fallback), /from this business/);
  assert.equal(priceSessionOffering(offering, rates, fallback).tiers[0].priceCents, 75300);
  assert.equal(priceSessionOffering(mixed, [{ ...rates[0], amountCents: 20000 }], fallback).tiers[1].priceCents, 30000);
});

const offering = {
  coverageItems: [{ id: "first", name: "First look" }, { id: "reception", name: "Reception" }],
  tiers: [
    { id: "essential", name: "Essential", priceCents: 200000, durationMinutes: 360, coverageIds: ["reception"] },
    { id: "signature", name: "Signature", priceCents: 350000, durationMinutes: 480, coverageIds: ["first", "reception"] }
  ],
  addOns: [{ id: "album", name: "Album", priceCents: 25000 }]
};

test("session tiers round-trip once-defined coverage with independent prices and durations", () => {
  const draft = sessionOfferingDraft(offering, 60, null);
  const saved = sessionOfferingFormSchema.parse(JSON.stringify(draft));
  assert.deepEqual(saved, offering);
  assert.deepEqual(selectSessionPackage(saved, "essential")?.coverage, ["Reception"]);
  const signature = selectSessionPackage(saved, "signature", ["album"]);
  assert.equal(signature?.priceCents, 375000);
  assert.equal(signature?.durationMinutes, 480);
  assert.deepEqual(signature?.coverage, ["First look", "Reception"]);
  saved.coverageItems[0].name = "Changed later";
  assert.deepEqual(signature?.coverage, ["First look", "Reception"], "a booking's inclusions are a snapshot, not references");
});

test("optional package deliverables round-trip and are captured in the booking snapshot", () => {
  const draft = sessionOfferingDraft(offering, 60, null);
  draft.tiers[0].deliverables = { locations: 2, outfitChanges: 0, finalPhotos: 35 };
  const saved = sessionOfferingFormSchema.parse(JSON.stringify(draft));
  const snapshot = sessionPackageSnapshotSchema.parse(selectSessionPackage(saved, "essential"));
  assert.deepEqual(snapshot.deliverables, draft.tiers[0].deliverables);
  assert.equal(saved.tiers[1].deliverables, undefined);

  for (const locations of [-1, 1.5]) {
    draft.tiers[0].deliverables.locations = locations;
    assert.equal(sessionOfferingFormSchema.safeParse(JSON.stringify(draft)).success, false);
  }
});

test("legacy session types keep their price and duration without requiring migration to tiers", () => {
  assert.equal(selectSessionPackage(null), null);
  const draft = sessionOfferingDraft(null, 75, null);
  const saved = sessionOfferingFormSchema.parse(JSON.stringify(draft));
  assert.equal(saved.tiers.length, 1);
  assert.equal(saved.tiers[0].durationMinutes, 75);
  assert.equal(saved.tiers[0].priceCents, null);
});

test("rejects invalid package references, duplicate names, empty tiers and unpriced multiple tiers", () => {
  assert.throws(() => selectSessionPackage(offering, "foreign"), /Choose a package/);
  assert.throws(() => selectSessionPackage(offering, "essential", ["foreign"]), /available extras/);
  assert.throws(() => selectSessionPackage(offering, "essential", ["album", "album"]), /available extras/);
  assert.throws(() => selectSessionPackage(null, "signature"), /Choose a package/);
  for (const invalid of [
    { ...offering, tiers: [] },
    { ...offering, tiers: [offering.tiers[0], { ...offering.tiers[1], name: "essential" }] },
    { ...offering, tiers: [offering.tiers[0], { ...offering.tiers[1], priceCents: null }] },
    { ...offering, tiers: [{ ...offering.tiers[0], coverageIds: ["missing"] }] },
    { ...offering, tiers: [{ ...offering.tiers[0], coverageIds: ["reception", "reception"] }] },
    { ...offering, tiers: [{ ...offering.tiers[0], durationMinutes: 0 }] }
  ]) assert.equal(sessionOfferingSchema.safeParse(invalid).success, false);
});

test("package form rejects malformed JSON and money with excess precision", () => {
  assert.equal(sessionOfferingFormSchema.safeParse("{").success, false);
  const draft = sessionOfferingDraft(offering, 60, null);
  for (const price of ["1.001", "-1", "NaN", "1e3", ""]) {
    draft.tiers[1].price = price;
    assert.equal(sessionOfferingFormSchema.safeParse(JSON.stringify(draft)).success, false);
  }
});

test("tier migration is additive and leaves old services, packages and bookings untouched", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Service" (id text, slug text); CREATE TABLE "Booking" (id text, "priceCents" int); CREATE TABLE "ServicePackage" (id text);
      INSERT INTO "Service" VALUES ('service', 'existing-link'); INSERT INTO "Booking" VALUES ('booked', 15000); INSERT INTO "ServicePackage" VALUES ('bundle');`);
    await db.exec(readFileSync("prisma/migrations/20261015010000_session_package_tiers/migration.sql", "utf8"));
    assert.deepEqual((await db.query('SELECT * FROM "Service"')).rows[0], { id: "service", slug: "existing-link", sessionOffering: null });
    assert.deepEqual((await db.query('SELECT * FROM "Booking"')).rows[0], { id: "booked", priceCents: 15000, packageSnapshot: null });
    assert.equal((await db.query('SELECT * FROM "ServicePackage"')).rows.length, 1);
  } finally { await db.close(); }
});
