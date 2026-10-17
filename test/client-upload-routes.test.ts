import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import * as validation from "../lib/uploads/validation";

function routeHarness({ closed = false, quota = true, existingFile = false, size = 100 } = {}) {
  const calls = {
    query: { where: { siteId: "" } },
    reservation: { where: { siteId: "", fileCount: { lt: 0 }, reservedBytes: { lte: BigInt(0) } }, data: { reservedBytes: { increment: 0 } } },
    completed: false
  };
  const file = { id: "file", requestId: "request", objectKey: "private/key", sizeBytes: 100, completedAt: null };
  const tx = {
    uploadRequest: { updateMany: async (args: typeof calls.reservation) => { calls.reservation = args; return { count: quota ? 1 : 0 }; } },
    clientUpload: { create: async () => file }
  };
  const prisma = {
    uploadRequest: { findFirst: async (args: typeof calls.query) => { calls.query = args; return { id: "request", closedAt: closed ? new Date() : null, expiresAt: new Date(Date.now() + 60000) }; } },
    clientUpload: { findFirst: async () => existingFile ? file : null, update: async () => { calls.completed = true; } },
    $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx)
  };
  const mocks: Record<string, unknown> = {
    "@/lib/prisma": { prisma }, "@/lib/site": { getSiteSettings: async () => ({ siteId: "site", enabledModuleIds: ["uploads"] }) },
    "@/shell/modules": { getModule: () => ({ id: "uploads" }) },
    "@/lib/public-rate-limit": { publicRateLimitForSite: async () => "" },
    "@/lib/uploads/validation": validation,
    "@/lib/uploads/storage": { originalSize: async () => size, signOriginalUpload: async () => "https://bucket.example/signed" }
  };
  const filename = path.resolve("app/api/uploads/[token]/route.ts");
  const exports: { POST?: (req: NextRequest, context: unknown) => Promise<Response> } = {};
  const require = createRequire(filename);
  runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, process, console, Date, BigInt, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return { calls, post: (body: object, origin = "https://admin.example") => exports.POST!(new NextRequest("https://admin.example/api/uploads/token", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body)
  }), { params: Promise.resolve({ token: "token" }) }) };
}

const original = { filename: "photo.HEIC", sizeBytes: 100, senderName: "Client", senderEmail: "client@example.com" };

test("upload authorization is scoped to the current site and atomically reserves finite space", async () => {
  const h = routeHarness();
  const response = await h.post(original);
  assert.equal(response.status, 200);
  assert.equal(h.calls.query.where.siteId, "site");
  assert.equal(h.calls.reservation.where.siteId, "site");
  assert.equal(h.calls.reservation.where.fileCount.lt, 200);
  assert.equal(h.calls.reservation.where.reservedBytes.lte, validation.maxRequestBytes - BigInt(100));
  assert.equal(h.calls.reservation.data.reservedBytes.increment, 100);
});

test("closed, over-quota, and cross-origin requests cannot authorize originals", async () => {
  assert.equal((await routeHarness({ closed: true }).post(original)).status, 410);
  assert.equal((await routeHarness({ quota: false }).post(original)).status, 409);
  assert.equal((await routeHarness().post(original, "https://other.example")).status, 403);
});

test("only an existing, size-verified file can be marked received, including in-flight uploads after close", async () => {
  assert.equal((await routeHarness().post({ action: "complete", id: "foreign-file" })).status, 404);
  const incomplete = routeHarness({ existingFile: true, size: 50 });
  assert.equal((await incomplete.post({ action: "complete", id: "file" })).status, 409);
  assert.equal(incomplete.calls.completed, false);
  const received = routeHarness({ existingFile: true, closed: true });
  assert.equal((await received.post({ action: "complete", id: "file" })).status, 200);
  assert.equal(received.calls.completed, true);
});
