import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { resolveIncludedServices, serviceLibraryInputSchema } from "../lib/scheduling/service-library";
import { sessionOfferingDraft, sessionOfferingFormSchema, sessionOfferingSchema, selectSessionPackage } from "../lib/scheduling/session-offering";

const offering = { coverageItems: [{ id: "legacy-ceremony", name: "Ceremony" }], tiers: [{ id: "standard", name: "Standard", durationMinutes: 60, priceCents: 10000, coverageIds: ["legacy-ceremony"] }], addOns: [] };
const item = { id: "library-ceremony", name: "Ceremony", description: "Your ceremony photographed from arrival to your first kiss.", category: "Weddings", tags: ["ceremony"] };

test("library input trims metadata, normalizes tags, and bounds client-facing descriptions", () => {
  const parsed = serviceLibraryInputSchema.parse({ name: " Ceremony ", description: " For clients. ", category: " Weddings ", tags: "Wedding, ceremony, WEDDING, " });
  assert.deepEqual(parsed, { name: "Ceremony", description: "For clients.", category: "Weddings", tags: ["wedding", "ceremony"] });
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
  assert.deepEqual(snapshot?.includedItems, [{ name: item.name, description: item.description }]);
  linked.coverageItems[0].description = "Changed after booking";
  assert.equal(snapshot?.includedItems?.[0].description, item.description);
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
