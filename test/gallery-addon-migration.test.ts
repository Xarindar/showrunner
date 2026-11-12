import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("gallery add-on migrations preserve existing packages and restrict deletion of linked catalog items", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Product" (id TEXT PRIMARY KEY); CREATE TABLE "ServiceLibraryItem" (id TEXT PRIMARY KEY);
      CREATE TABLE "PortfolioGallery" (id TEXT PRIMARY KEY); CREATE TABLE "PortfolioSelectionPurchase" (id TEXT PRIMARY KEY, "packageProductId" TEXT NOT NULL);
      INSERT INTO "PortfolioSelectionPurchase" VALUES ('existing', 'package'); INSERT INTO "ServiceLibraryItem" VALUES ('addon'); INSERT INTO "PortfolioGallery" VALUES ('gallery'); INSERT INTO "Product" VALUES ('digital');`);
    await db.exec(readFileSync("prisma/migrations/20261112010000_gallery_extra_photo_addon/migration.sql", "utf8"));
    await db.exec(readFileSync("prisma/migrations/20261112020000_service_deliverable_increases/migration.sql", "utf8"));
    assert.deepEqual((await db.query('SELECT "packageProductId", "extraPhotoAddOnId" FROM "PortfolioSelectionPurchase"')).rows, [{ packageProductId: "package", extraPhotoAddOnId: null }]);
    assert.deepEqual((await db.query('SELECT deliverables FROM "ServiceLibraryItem"')).rows, [{ deliverables: {} }]);
    await db.exec(`UPDATE "ServiceLibraryItem" SET "commerceProductId"='digital'; UPDATE "PortfolioGallery" SET "extraPhotoAddOnId"='addon';`);
    await assert.rejects(db.exec(`DELETE FROM "ServiceLibraryItem" WHERE id='addon'`));
    await assert.rejects(db.exec(`DELETE FROM "Product" WHERE id='digital'`));
    await db.exec(`INSERT INTO "PortfolioSelectionPurchase" (id, "packageProductId", "extraPhotoAddOnId") VALUES ('session', NULL, 'addon')`);
  } finally { await db.close(); }
});
