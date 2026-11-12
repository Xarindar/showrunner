import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("session migration preserves existing rows and keeps folder/booking references valid", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Client" (id TEXT PRIMARY KEY); CREATE TABLE "PortfolioGallery" (id TEXT PRIMARY KEY);
      CREATE TABLE "MediaFolder" (id TEXT PRIMARY KEY); CREATE TABLE "Booking" (id TEXT PRIMARY KEY);
      INSERT INTO "Client" VALUES ('client'); INSERT INTO "PortfolioGallery" VALUES ('gallery');`);
    await db.exec(readFileSync("prisma/migrations/20261111180000_client_session_folders/migration.sql", "utf8"));
    await db.exec(readFileSync("prisma/migrations/20261111200000_client_session_processing/migration.sql", "utf8"));
    const existing = (await db.query<{ processingUploads: number; processingError: string }>('SELECT * FROM "PortfolioGallery"')).rows;
    assert.equal(existing.length, 1); assert.equal(existing[0].processingUploads, 0); assert.equal(existing[0].processingError, "");
    await db.exec(`INSERT INTO "MediaFolder" VALUES ('client-folder'), ('session-folder'); INSERT INTO "Booking" VALUES ('booking');
      UPDATE "Client" SET "mediaFolderId"='client-folder';
      UPDATE "PortfolioGallery" SET "mediaFolderId"='session-folder', "bookingId"='booking';`);
    await assert.rejects(db.exec(`DELETE FROM "Booking" WHERE id='booking'`));
    await db.exec(`DELETE FROM "MediaFolder";`);
    assert.equal((await db.query<{ mediaFolderId: string | null }>('SELECT "mediaFolderId" FROM "Client"')).rows[0].mediaFolderId, null);
    assert.equal((await db.query<{ mediaFolderId: string | null }>('SELECT "mediaFolderId" FROM "PortfolioGallery"')).rows[0].mediaFolderId, null);
  } finally { await db.close(); }
});
