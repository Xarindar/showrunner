import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";

async function main() {
  const base = process.argv[2] || "http://localhost:3100";
  const local = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!local(new URL(base).hostname) || !local(new URL(process.env.DATABASE_URL || "").hostname)) throw new Error("This verification only runs against a local server and local database");
  const id = `content-verification-${randomUUID()}`;
  const key = `pk_live_${randomBytes(24).toString("base64url")}`;
  const siteId = "site";
  await prisma.siteApiKey.create({ data: { id, siteId, name: "Temporary content verification", publicKey: key, allowedOrigins: [base], scopes: ["content:read"] } });
  try {
    const endpoint = `${base}/api/public/v1/content/studio?page=home`;
    const headers = { "X-Showrunner-Key": key, Origin: base };
    const response = await fetch(endpoint, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.data.pageId, "home");
    assert.equal(body.data.schemaVersion, 1);
    const settings = await prisma.siteSettings.findUniqueOrThrow({ where: { siteId } });
    assert.equal(body.data.business.businessName, settings.businessName);
    assert.equal(body.data.business.email, settings.contactEmail);
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { ...headers, Origin: "https://not-allowed.example" } })).status, 403);
    assert.equal((await fetch(`${base}/api/public/v1/content/studio?page=unknown`, { headers })).status, 404);
    console.log("PASS: public JSON delivery, canonical business values, missing-key rejection, origin restriction, unknown-page rejection.");
  } finally { await prisma.siteApiKey.delete({ where: { id } }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
