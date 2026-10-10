import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("additive migration preserves legacy refs; database enforces immutable purchase and refund revocation", async () => {
  const db = new PGlite();
  try {
    // Minimal pre-migration boundary tables, with an intentional historical dangling media reference.
    await db.exec(`CREATE TABLE "Product" (id text PRIMARY KEY); CREATE TABLE "Client" (id text PRIMARY KEY);
      CREATE TABLE "Order" (id text PRIMARY KEY); CREATE TABLE "MediaAsset" (id text PRIMARY KEY);
      CREATE TABLE "Payment" (id text PRIMARY KEY, "orderId" text, status text, "refundedCents" integer DEFAULT 0);
      CREATE TABLE "PortfolioGallery" (id text PRIMARY KEY, "siteId" text DEFAULT 'site');
      CREATE TABLE "PortfolioGalleryItem" (id text PRIMARY KEY, "mediaAssetId" text);
      INSERT INTO "PortfolioGalleryItem" VALUES ('legacy','missing-original');`);
    await db.exec(readFileSync("prisma/migrations/20261008013000_client_gallery_purchases/migration.sql", "utf8"));
    assert.equal((await db.query<{ mediaAssetId: string }>(`SELECT "mediaAssetId" FROM "PortfolioGalleryItem" WHERE id='legacy'`)).rows[0].mediaAssetId, "missing-original");
    await assert.rejects(db.exec(`INSERT INTO "PortfolioGalleryItem" VALUES ('new-invalid','missing-original')`), /foreign key/);
    await db.exec(`INSERT INTO "PortfolioGallery" (id) VALUES ('gallery'); INSERT INTO "Order" VALUES ('order');
      INSERT INTO "MediaAsset" VALUES ('asset'),('asset2');
      INSERT INTO "PortfolioGalleryItem" VALUES ('item','asset'),('item2','asset2');
      INSERT INTO "Payment" VALUES ('payment','order','PENDING',0,NULL);
      BEGIN;
      INSERT INTO "PortfolioSelectionPurchase" (id,"galleryId","siteId","clientId","packageProductId","packageName",allowance,"extraPriceCents",currency,"extraCount","selectedCount","totalCents","orderId")
      VALUES ('purchase','gallery','site','client','package','Package',0,750,'USD',1,1,750,'order');
      INSERT INTO "PortfolioPurchasedSelection" VALUES ('selection','purchase','item','asset'); COMMIT;`);
    await assert.rejects(db.exec(`UPDATE "PortfolioSelectionPurchase" SET "totalCents"=1 WHERE id='purchase'`), /immutable/);
    await assert.rejects(db.exec(`UPDATE "PortfolioPurchasedSelection" SET "mediaAssetId"='asset2' WHERE id='selection'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "PortfolioPurchasedSelection" WHERE id='selection'`), /immutable/);
    await assert.rejects(db.exec(`INSERT INTO "PortfolioPurchasedSelection" VALUES ('extra','purchase','item2','asset2')`), /count cannot change/);
    await assert.rejects(db.exec(`DELETE FROM "MediaAsset" WHERE id='asset'`), /foreign key/);
    await db.exec(`UPDATE "PortfolioSelectionPurchase" SET "checkoutStartedAt"=CURRENT_TIMESTAMP WHERE id='purchase';
      UPDATE "Payment" SET status='PAID' WHERE id='payment';
      UPDATE "Payment" SET "refundedCents"=1 WHERE id='payment';`);
    assert.equal((await db.query<{ revokedAt: Date | null }>(`SELECT "revokedAt" FROM "PortfolioSelectionPurchase" WHERE id='purchase'`)).rows[0].revokedAt, null, "a refund reservation is not a verified refund");
    await db.exec(`UPDATE "Payment" SET "refundedCents"=0 WHERE id='payment'`);
    assert.equal((await db.query<{ revokedAt: Date | null }>(`SELECT "revokedAt" FROM "PortfolioSelectionPurchase" WHERE id='purchase'`)).rows[0].revokedAt, null, "failed reservation rollback must not permanently revoke");
    // Same monotonic write used by the verified provider-refund helper.
    await db.exec(`UPDATE "PortfolioSelectionPurchase" SET "revokedAt"=CURRENT_TIMESTAMP WHERE "orderId"='order' AND "revokedAt" IS NULL`);
    const revoked = (await db.query<{ revokedAt: Date | null }>(`SELECT "revokedAt" FROM "PortfolioSelectionPurchase" WHERE id='purchase'`)).rows[0].revokedAt;
    assert.ok(revoked);
    await db.exec(`UPDATE "Payment" SET status='PAID', "refundedCents"=0 WHERE id='payment'`);
    assert.ok((await db.query<{ revokedAt: Date | null }>(`SELECT "revokedAt" FROM "PortfolioSelectionPurchase" WHERE id='purchase'`)).rows[0].revokedAt);
    await assert.rejects(db.exec(`UPDATE "PortfolioSelectionPurchase" SET "revokedAt"=NULL WHERE id='purchase'`), /permanent/);
  } finally { await db.close(); }
});
