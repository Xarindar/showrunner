import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { emailConnectionSchema, EmailConnectionError, isPublicSmtpAddress, sendWithEmailProvider } from "../lib/email/provider-connection";
import { encryptEmailSecret, decryptEmailSecret } from "../lib/email/credential-crypto";

const realRequire = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  runInNewContext(source, { exports, require: (name: string) => name in mocks ? mocks[name] : realRequire(name),
    process, Buffer, URL, AbortSignal, Date, Error, console, ...extra });
  return exports;
}
const details = { kind: "resend", fromName: "Studio", fromEmail: "hello@studio.example", replyToEmail: "owner@example.com",
  testEmail: "owner@example.com", secret: "provider-secret", smtpHost: "", smtpPort: "587", smtpUser: "", revision: "0" };
const message = { messageId: "<outbox-id@studio.example>", fromName: "Studio", fromEmail: details.fromEmail,
  toEmail: details.testEmail, replyToEmail: details.replyToEmail, subject: "Confirmed", textBody: "Confirmed", htmlBody: "<p>Confirmed</p>" };

test("provider setup validates addresses, SMTP details, ports and Gmail presets", () => {
  assert.equal(emailConnectionSchema.parse(details).kind, "resend");
  assert.equal(emailConnectionSchema.safeParse({ ...details, fromEmail: "not-an-email" }).success, false);
  assert.equal(emailConnectionSchema.safeParse({ ...details, fromName: "Studio\r\nBcc: bad@example.com" }).success, false);
  assert.equal(emailConnectionSchema.safeParse({ ...details, smtpPort: 25 }).success, false);
  assert.equal(emailConnectionSchema.safeParse({ ...details, kind: "smtp", smtpHost: "https://host.example/path", smtpUser: "user" }).success, false);
  const gmail = emailConnectionSchema.parse({ ...details, kind: "gmail", secret: "abcd efgh ijkl mnop" });
  assert.equal(gmail.smtpHost, "smtp.gmail.com");
  assert.equal(gmail.smtpPort, 465);
  assert.equal(gmail.smtpUser, details.fromEmail);
  assert.equal(gmail.secret, "abcdefghijklmnop");
  const ionos = emailConnectionSchema.parse({ ...details, kind: "ionos", smtpHost: "ignored.example", smtpPort: 587, smtpUser: "ignored" });
  assert.equal(ionos.smtpHost, "smtp.ionos.com");
  assert.equal(ionos.smtpPort, 465);
  assert.equal(ionos.smtpUser, details.fromEmail);
});

test("client credentials use the deployment's existing secret and reject weak keys or tampering", () => {
  const previous = { ...process.env };
  try {
    delete process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY;
    process.env.AUTH_SECRET = "independent-deployment-auth-secret-with-enough-entropy";
    const sealed = encryptEmailSecret("provider-secret");
    assert(!sealed.includes("provider-secret"));
    assert.equal(decryptEmailSecret(sealed), "provider-secret");
    process.env.AUTH_SECRET = "different-independent-deployment-secret-with-enough-entropy";
    assert.throws(() => decryptEmailSecret(sealed));
    process.env.AUTH_SECRET = "weak";
    assert.throws(() => encryptEmailSecret("provider-secret"));
  } finally { process.env = previous; }
});

test("SMTP blocks private, mapped, special-use and non-IP addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2002:7f00:1::", "localhost"]) {
    assert.equal(isPublicSmtpAddress(address), false, address);
  }
  assert.equal(isPublicSmtpAddress("8.8.8.8"), true);
  assert.equal(isPublicSmtpAddress("2607:f8b0:4001:c1a::6d"), true);
});

test("Resend sends with the owner's key and stable retry identity; errors never expose the key", async () => {
  const originalFetch = globalThis.fetch;
  const idempotencyKeys: string[] = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      const headers = options?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer own-key");
      idempotencyKeys.push(headers["Idempotency-Key"]);
      const body = JSON.parse(String(options?.body));
      assert.equal(body.from, '"Studio" <hello@studio.example>');
      assert.equal(body.reply_to, details.replyToEmail);
      assert.equal(body.to[0], details.testEmail);
      return Response.json({ id: "provider-id" });
    };
    const config = emailConnectionSchema.parse(details);
    assert.equal((await sendWithEmailProvider(config, "own-key", message)).providerMessageId, "provider-id");
    await sendWithEmailProvider(config, "own-key", message);
    assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
    globalThis.fetch = async () => Response.json({ message: "own-key" }, { status: 403 });
    await assert.rejects(sendWithEmailProvider(config, "own-key", message), error => {
      assert(error instanceof EmailConnectionError && error.needsAttention);
      assert(!error.message.includes("own-key")); return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});

test("SMTP pins public DNS results, requires TLS, and closes connections after send", async () => {
  let address = "8.8.8.8";
  let closed = 0;
  const provider = load("lib/email/provider-connection.ts", {
    "../prisma": {}, "./credential-crypto": {},
    "node:dns/promises": { lookup: async () => [{ address, family: 4 }] },
    nodemailer: { createTransport: (config: Record<string, unknown>) => {
      assert.equal(config.host, "8.8.8.8"); assert.equal(config.requireTLS, true);
      assert.equal((config.tls as { servername: string }).servername, "smtp.provider.example");
      assert.equal(config.disableFileAccess, true); assert.equal(config.disableUrlAccess, true);
      return { sendMail: async () => ({ accepted: [details.testEmail], messageId: "smtp-id" }), close: () => { closed++; } };
    } }
  });
  const send = provider.sendWithEmailProvider as typeof sendWithEmailProvider;
  const config = emailConnectionSchema.parse({ ...details, kind: "smtp", smtpHost: "smtp.provider.example", smtpUser: "owner" });
  assert.equal((await send(config, "password", message)).providerMessageId, "smtp-id");
  assert.equal(closed, 1);
  address = "127.0.0.1";
  await assert.rejects(send(config, "password", message), /public SMTP/);
});

function setupHarness({ failSend = false, existing = false, stale = false, siteId = "own-site", userId = "admin", kind = "resend" } = {}) {
  const writes: unknown[] = [];
  const sent: unknown[] = [];
  const saved = existing ? { ...emailConnectionSchema.parse({ ...details, kind }), revision: 1, encryptedSecret: "saved-secret" } : null;
  const actions = load("modules/settings/email-actions.ts", {
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "settings:update"); return { id: userId }; } },
    "@/lib/site": { getSiteSettings: async () => ({ siteId }) },
    "@/lib/audit": { recordAuditLog: async () => {} },
    "@/lib/email/credential-crypto": {
      encryptEmailSecret: (value: string) => `sealed:${Buffer.from(value).toString("base64")}`,
      decryptEmailSecret: (value: string) => value.startsWith("sealed:") ? Buffer.from(value.slice(7), "base64").toString() : "old-key"
    },
    "@/lib/email/provider-connection": { emailConnectionSchema, EmailConnectionError,
      sendWithEmailProvider: async (...input: unknown[]) => { sent.push(input); if (failSend) throw new EmailConnectionError("Check sender verification."); } },
    "@/lib/prisma": { prisma: { emailProviderConnection: {
      findUnique: async ({ where }: { where: { siteId: string } }) => { assert.equal(where.siteId, siteId); return saved; },
      create: async (input: unknown) => { writes.push(input); },
      updateMany: async (input: unknown) => { writes.push(input); return { count: stale ? 0 : 1 }; }
    } } }
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...details, kind, revision: existing ? "1" : "0" })) form.set(key, value);
  form.set("intent", "test");
  const save = actions.saveEmailProviderAction as (state: { error: string }, form: FormData) => Promise<{ error: string; testToken?: string }>;
  const run = () => save({ error: "" }, form);
  return { writes, sent, form, run, finish: async () => {
    const result = await run();
    if (result.error) return result;
    form.set("intent", "save"); form.set("testToken", result.testToken!);
    return run();
  } };
}

test("failed provider tests preserve a working connection; successful tests save only encrypted credentials", async () => {
  const failure = setupHarness({ existing: true, failSend: true });
  assert.equal((await failure.run()).error, "Check sender verification.");
  assert.equal(failure.writes.length, 0);
  const success = setupHarness();
  const tested = await success.run();
  assert(tested.testToken);
  assert.equal(success.writes.length, 0);
  success.form.set("intent", "save"); success.form.set("testToken", tested.testToken);
  await assert.rejects(success.run(), /redirect:.*saved=connected/);
  assert.equal(success.sent.length, 1);
  assert.equal(success.writes.length, 1);
  const serialized = JSON.stringify(success.writes);
  assert(serialized.includes("sealed"));
  assert(!serialized.includes("provider-secret"));
  const sent = success.sent[0] as [unknown, string, { toEmail: string; replyToEmail: string }];
  assert.equal(sent[2].toEmail, details.fromEmail);
  assert.equal(sent[2].replyToEmail, details.fromEmail);
});

test("changes require fresh revisions and only retain credentials for the same login", async () => {
  const oldRevision = setupHarness({ existing: true });
  oldRevision.form.set("revision", "0");
  assert.match((await oldRevision.run()).error, /another window/);
  assert.equal(oldRevision.sent.length, 0);
  const retained = setupHarness({ existing: true });
  retained.form.set("secret", "");
  await assert.rejects(retained.finish(), /redirect:/);
  assert.equal((retained.sent[0] as unknown[])[1], "old-key");
  const changedLogin = setupHarness({ existing: true });
  changedLogin.form.set("kind", "gmail"); changedLogin.form.set("secret", "");
  assert.match((await changedLogin.run()).error, /Enter the password/);
  assert.equal(changedLogin.sent.length, 0);
  const conflict = setupHarness({ existing: true, stale: true });
  assert.match((await conflict.finish()).error, /another window/);
  const gmail = setupHarness({ existing: true, kind: "gmail" });
  gmail.form.set("secret", "   ");
  assert.match((await gmail.run()).error, /Enter the password/);
  assert.equal(gmail.sent.length, 0);
});

test("Done requires a recent successful test for unchanged details, site and admin", async () => {
  const h = setupHarness();
  h.form.set("intent", "save");
  assert.match((await h.run()).error, /successful test/);
  assert.equal(h.sent.length, 0); assert.equal(h.writes.length, 0);
  h.form.set("intent", "test");
  const tested = await h.run();
  h.form.set("intent", "save"); h.form.set("testToken", tested.testToken!);
  h.form.set("fromEmail", "changed@studio.example");
  assert.match((await h.run()).error, /successful test/);
  assert.equal(h.writes.length, 0); assert.equal(h.sent.length, 1);
  for (const identity of [{ siteId: "other-site" }, { userId: "other-admin" }]) {
    const other = setupHarness(identity); other.form.set("intent", "save"); other.form.set("testToken", tested.testToken!);
    assert.match((await other.run()).error, /successful test/);
    assert.equal(other.writes.length, 0);
  }
  const proof = JSON.parse(Buffer.from(tested.testToken!.slice(7), "base64").toString());
  h.form.set("fromEmail", details.fromEmail);
  h.form.set("testToken", `sealed:${Buffer.from(JSON.stringify({ ...proof, expires: 0 })).toString("base64")}`);
  assert.match((await h.run()).error, /successful test/);
});

test("provider migration retains outbox records and removes the Google OAuth credential table", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Site" (id TEXT PRIMARY KEY); CREATE TABLE "EmailOutbox" (id TEXT PRIMARY KEY); INSERT INTO "Site" VALUES (\'site\'); INSERT INTO "EmailOutbox" VALUES (\'existing\');');
    await db.exec(readFileSync("prisma/migrations/20261113010000_google_email_connection/migration.sql", "utf8"));
    await db.exec(readFileSync("prisma/migrations/20261113020000_owned_email_provider/migration.sql", "utf8"));
    assert.equal((await db.query<{ deliveryProvider: string }>('SELECT "deliveryProvider" FROM "EmailOutbox"')).rows[0].deliveryProvider, "SMTP");
    assert.equal((await db.query<{ name: string | null }>(`SELECT to_regclass('"GoogleEmailConnection"')::text AS name`)).rows[0].name, null);
    await assert.rejects(db.exec(`INSERT INTO "EmailProviderConnection" ("siteId",kind,"fromName","fromEmail","replyToEmail","encryptedSecret","verifiedAt","updatedAt") VALUES ('foreign','resend','Studio','a@example.com','a@example.com','sealed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`));
  } finally { await db.close(); }
});

test("sender selection uses the site's own provider while preserving the marketing path", async () => {
  const sender = load("lib/email/sender.ts", {
    "@/lib/site": { getSiteSettingsForSite: async (siteId: string) => ({ siteId, businessName: "Studio" }) },
    "@/lib/prisma": { prisma: {
      emailProviderConnection: { findUnique: async ({ where }: { where: { siteId: string } }) => where.siteId === "own-site" ? details : null },
      emailSenderIdentity: { findFirst: async () => ({ id: "sender", name: "Studio", fromEmail: "marketing@studio.example", replyToEmail: "", isVerified: true }) }
    } }
  });
  const resolve = sender.resolveSender as (input: object) => Promise<{ deliveryProvider: string; fromEmail: string }>;
  assert.equal((await resolve({ siteId: "own-site", category: "TRANSACTIONAL" })).fromEmail, details.fromEmail);
  assert.equal((await resolve({ siteId: "own-site", category: "ADMIN" })).deliveryProvider, "CONNECTED");
  assert.equal((await resolve({ siteId: "other-site", category: "TRANSACTIONAL" })).deliveryProvider, "SMTP");
  assert.equal((await resolve({ siteId: "own-site", category: "MARKETING" })).fromEmail, "marketing@studio.example");
});

test("connected messages do not silently use a changed identity or the legacy SMTP provider", async () => {
  let lookups = 0;
  const provider = load("lib/email/provider-connection.ts", {
    "../prisma": { prisma: { emailProviderConnection: { findUnique: async () => {
      lookups++; return { ...details, fromEmail: "replacement@studio.example" };
    } } } }, "./credential-crypto": {}
  });
  const send = provider.sendConnectedEmail as (siteId: string, input: typeof message) => Promise<unknown>;
  await assert.rejects(send("own-site", message), /sending address changed/);
  assert.equal(lookups, 1);
});

test("outbox routes saved providers and retries failures without falling back to SMTP", async () => {
  const sent: string[] = [];
  const updates: Array<{ where: { id: string }; data: { status: string } }> = [];
  const rows = ["SMTP", "CONNECTED", "CONNECTED"].map((deliveryProvider, index) => ({
    ...message, id: String(index), siteId: "own-site", deliveryProvider, recipientEmail: details.testEmail,
    headers: {}, attemptCount: 0, nextAttemptAt: new Date()
  }));
  const tx = { $queryRaw: async () => rows, emailOutbox: { updateMany: async () => {} } };
  const worker = load("lib/email/process.ts", {
    "../prisma": { prisma: { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx),
      emailOutbox: { findMany: async () => rows, update: async (input: typeof updates[number]) => { updates.push(input); } } } },
    "./provider": { createSmtpProvider: () => ({ sendEmail: async () => { sent.push("smtp"); return { providerMessageId: "smtp-id" }; } }) },
    "./provider-connection": { sendConnectedEmail: async (siteId: string, input: { messageId: string }) => {
      assert.equal(siteId, "own-site");
      if (input.messageId.startsWith("<2@")) throw new Error("Provider unavailable");
      sent.push("connected"); return { providerMessageId: "own-provider-id" };
    } }, "./shared": { jsonHeaders: (value: unknown) => value, cleanError: () => "Provider unavailable" }
  });
  const processOutbox = worker.processEmailOutbox as () => Promise<{ sent: number; retried: number }>;
  const result = await processOutbox();
  assert.deepEqual(sent, ["smtp", "connected"]);
  assert.equal(result.sent, 2); assert.equal(result.retried, 1);
  assert.equal(updates.find(update => update.where.id === "2")?.data.status, "QUEUED");
});
