import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { hourlyPriceCents, hourlyRateInputSchema, servicePriceCents } from "../lib/scheduling/pricing";
import { serviceLibraryInputSchema, resolveIncludedServices } from "../lib/scheduling/service-library";

test("named rates validate money and hourly totals round only at the final cent", () => {
  assert.deepEqual(hourlyRateInputSchema.parse({ name: " Photography ", amount: "125.50" }), { name: "Photography", amount: 12550 });
  for (const amount of ["", "-1", "1.001", "Infinity", "1e3"]) assert.equal(hourlyRateInputSchema.safeParse({ name: "Standard", amount }).success, false);
  assert.equal(hourlyPriceCents(12550, 90), 18825);
  assert.equal(hourlyPriceCents(10000, 1), 167);
  assert.equal(hourlyPriceCents(0, 45), 0);
  assert.throws(() => hourlyPriceCents(999999999, 1440), /less/);
  assert.throws(() => hourlyPriceCents(10000, 0), /less/);
  assert.equal(servicePriceCents({ pricingType: "FLAT_RATE", priceCents: 5000, durationMinutes: 90 }), 5000);
  assert.equal(servicePriceCents({ pricingType: "HOURLY", priceCents: 1, durationMinutes: 90, hourlyRate: { id: "rate", name: "Standard", amountCents: 12550 } }), 18825);
  assert.throws(() => servicePriceCents({ pricingType: "HOURLY", priceCents: null, durationMinutes: 60 }), /Choose an hourly rate/);
});

test("included services retain their pricing and require a named rate for hourly pricing", () => {
  const base = { name: "Coverage", description: "Ceremony photography", category: "Wedding", tags: "" };
  assert.equal(serviceLibraryInputSchema.safeParse({ ...base, pricingType: "HOURLY" }).success, false);
  const hourly = serviceLibraryInputSchema.parse({ ...base, pricingType: "HOURLY", hourlyRateId: "rate", price: "999" });
  assert.equal(hourly.priceCents, null);
  const flat = serviceLibraryInputSchema.parse({ ...base, pricingType: "FLAT_RATE", hourlyRateId: "rate", price: "100.50" });
  assert.equal(flat.priceCents, 10050);
  assert.equal(flat.hourlyRateId, null);
  const offering = { coverageItems: [{ id: "coverage", name: "Coverage" }], tiers: [{ id: "standard", name: "Standard", priceCents: 20000, durationMinutes: 60, coverageIds: ["coverage"] }], addOns: [] };
  const resolved = resolveIncludedServices(offering, [{ ...hourly, id: "library" }]);
  assert.equal(resolved.coverageItems[0].hourlyRateId, "rate");
  assert.equal(resolved.coverageItems[0].pricingType, "HOURLY");
  assert.equal(resolved.tiers[0].priceCents, 20000);
});

test("rate migration defaults existing services to flat rate and leaves booked prices intact", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Site" (id TEXT PRIMARY KEY); CREATE TABLE "Service" (id TEXT PRIMARY KEY, "priceCents" INTEGER); CREATE TABLE "ServiceLibraryItem" (id TEXT PRIMARY KEY); CREATE TABLE "Booking" (id TEXT, "priceCents" INTEGER);
      INSERT INTO "Site" VALUES ('site'); INSERT INTO "Service" VALUES ('service', 12345); INSERT INTO "ServiceLibraryItem" VALUES ('item'); INSERT INTO "Booking" VALUES ('booked', 54321);`);
    await db.exec(readFileSync("prisma/migrations/20261022010000_service_hourly_rates/migration.sql", "utf8"));
    assert.deepEqual((await db.query('SELECT "pricingType", "priceCents", "hourlyRateId" FROM "Service"')).rows[0], { pricingType: "FLAT_RATE", priceCents: 12345, hourlyRateId: null });
    assert.deepEqual((await db.query('SELECT * FROM "Booking"')).rows[0], { id: "booked", priceCents: 54321 });
    await db.exec(`INSERT INTO "HourlyRate" (id,"siteId",name,"amountCents","updatedAt") VALUES ('rate','site','Standard',10000,CURRENT_TIMESTAMP); UPDATE "Service" SET "hourlyRateId"='rate';`);
    await assert.rejects(db.exec(`DELETE FROM "HourlyRate" WHERE id='rate'`), /foreign key/i);
  } finally { await db.close(); }
});
