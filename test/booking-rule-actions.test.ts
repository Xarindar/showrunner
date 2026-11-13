import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { bookingRuleSetSchema, bookingRulesSchema } from "../lib/scheduling/booking-rules";
import * as bookingRules from "../lib/scheduling/booking-rules";

const sampleRules = [bookingRules.bookingRuleSchema.parse({ id: "session-notes", kind: "intake", category: "Session", label: "Anything we should prepare?", type: "TEXT", required: false, options: [] })];

test("rule-set actions require scheduling permission and scope every read and save to the current site", async () => {
  let allowed = false;
  let calls = 0;
  let fail = false;
  const require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission, "scheduling:manage"); if (!allowed) throw new Error("Forbidden"); } },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/scheduling/booking-rules": { bookingRuleSetSchema, bookingRulesSchema },
    "@/lib/prisma": { prisma: { bookingRuleSet: {
      findMany: async ({ where }: { where: { siteId: string } }) => { calls++; assert.equal(where.siteId, "site-a"); return [{ id: "set", name: "Contact", rules: sampleRules }]; },
      create: async ({ data }: { data: { siteId: string; name: string; nameKey: string; rules: unknown } }) => { calls++; assert.equal(data.siteId, "site-a"); assert.equal(data.nameKey, "contact"); if (fail) throw new Error("Database unavailable"); return { id: "set", ...data }; }
    } } }
  };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(ts.transpileModule(readFileSync("modules/scheduling/booking-rule-actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: (id: string) => mocks[id] ?? require(id) });
  await assert.rejects(exports.listBookingRuleSets(), /Forbidden/);
  await assert.rejects(exports.saveBookingRuleSet({ name: "Contact", rules: sampleRules }), /Forbidden/);
  assert.equal(calls, 0);
  allowed = true;
  assert.equal((await exports.listBookingRuleSets() as unknown[]).length, 1);
  assert.ok((await exports.saveBookingRuleSet({ name: "Contact", rules: sampleRules, siteId: "foreign-site" }) as { set?: unknown }).set);
  fail = true;
  assert.match((await exports.saveBookingRuleSet({ name: "Contact", rules: sampleRules }) as { error: string }).error, /could not be saved/);
});

test("public bookings forward structured answers and report rule validation as a client error before writing", async () => {
  class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
  const rule = bookingRules.bookingRuleSchema.parse({ id: "style", kind: "intake", category: "Session", label: "Style", type: "SELECT", required: true, options: ["Candid", "Posed"] });
  const require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = {
    "server-only": {}, "next/cache": {},
    "@/lib/scheduling/booking-rules": bookingRules,
    "@/lib/embed/gateway": { EmbedRequestError: RequestError },
    "@/lib/scheduling/native": { nativeSchedulingAdapter: { createBooking: async (input: { siteId: string; customerName: string; customerEmail: string; intakeAnswers?: Record<string, string> }) => {
      assert.equal(input.siteId, "site-a");
      assert.equal((input as { customerCompany?: string }).customerCompany, "Client Studio");
      assert.equal((input as { customerPhone?: string }).customerPhone, "+1 (555) 123-4567");
      bookingRules.validateBookingRuleAnswers([rule], input.intakeAnswers, input);
      throw new Error("Reached booking transaction");
    } } }
  };
  const exports: Record<string, (input: unknown) => Promise<unknown>> = {};
  runInNewContext(ts.transpileModule(readFileSync("lib/embed/public-scheduling.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URL, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id) });
  const body = { serviceId: "service", startsAt: "2030-01-01T15:00:00Z", customerName: "Test Client", customerEmail: "test@example.com", customerPhone: " +1 (555) 123-4567 ", customerCompany: "  Client Studio  " };
  for (const customerPhone of [undefined, null, "", "   "]) {
    await assert.rejects(exports.createPublicSchedulingBooking({ siteId: "site-a", body: { ...body, customerPhone, intakeAnswers: { style: "Candid" } } }), error => error instanceof RequestError && error.status === 400 && /phone number/.test(error.message));
  }
  for (const customerCompany of [123, "x".repeat(201)]) await assert.rejects(exports.createPublicSchedulingBooking({ siteId: "site-a", body: { ...body, customerCompany } }), error => error instanceof RequestError && error.status === 400);
  for (const intakeAnswers of [{}, { style: "Forged" }]) await assert.rejects(exports.createPublicSchedulingBooking({ siteId: "site-a", body: { ...body, intakeAnswers } }), error => error instanceof RequestError && error.status === 400);
  await assert.rejects(exports.createPublicSchedulingBooking({ siteId: "site-a", body: { ...body, intakeAnswers: { style: "Candid" } } }), /Reached booking transaction/);
});
