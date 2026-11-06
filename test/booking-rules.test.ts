import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { bookingRuleSchema, bookingRulesSchema, bookingRuleSetSchema, readBookingRules, validateBookingRuleAnswers } from "../lib/scheduling/booking-rules";
import { enumLabel } from "../lib/format";

const choice = bookingRuleSchema.parse({ id: "style", kind: "intake", category: "Session", label: "Preferred style", type: "RADIO", required: true, options: ["Candid", "Posed"] });
const contact = { customerName: "Test Client", customerEmail: "test@example.com" };
const legacyContactRules = [
  { id: "contact-name", label: "Name", contactField: "customerName", required: true },
  { id: "contact-email", label: "Email", contactField: "customerEmail", required: true },
  { id: "contact-phone", label: "Phone", contactField: "customerPhone", required: false }
].map(rule => bookingRuleSchema.parse({ ...rule, category: "Contact", kind: "intake", type: "TEXT", options: [] }));

test("booking terms replace the old labels without changing saved terms or enum values", () => {
  assert.equal(enumLabel("CONTRACT"), "Booking Terms & Conditions");
  assert.equal(enumLabel("INVOICE"), "invoice");
  assert.equal(enumLabel("PARTIALLY_PAID"), "partially paid");
  const saved = { ...choice, kind: "policy", category: "Contracts", label: "Original agreement text" };
  const [rule] = readBookingRules([saved]);
  assert.equal(rule.category, "Booking Terms & Conditions");
  assert.equal(rule.id, saved.id);
  assert.equal(rule.label, saved.label);
  assert.equal(saved.category, "Contracts");
  assert.equal(readBookingRules(null, { policyText: saved.label })[0].category, "Booking Terms & Conditions");
  assert.equal(bookingRuleSchema.parse({ ...choice, category: "Session" }).category, "Session");
});
test("rules retain legacy content and validate configurable choices, categories and limits", () => {
  assert.equal(readBookingRules(null, { intakePrompt: "Existing question", policyText: "Existing policy" }).length, 2);
  assert.deepEqual(readBookingRules([], { intakePrompt: "Do not resurrect" }), []);
  assert.equal(bookingRuleSchema.safeParse({ ...choice, options: ["One"] }).success, false);
  assert.equal(bookingRuleSchema.safeParse({ ...choice, options: ["Same", "same"] }).success, false);
  assert.equal(bookingRulesSchema.safeParse([choice, choice]).success, false);
  assert.equal(bookingRuleSetSchema.safeParse({ name: "", rules: [choice] }).success, false);
  assert.equal(bookingRulesSchema.safeParse(Array.from({ length: 41 }, (_, index) => ({ ...choice, id: String(index) }))).success, false);
});
test("booking answers enforce required fields, allowed choices, ownership and contact reuse", () => {
  const rules = [...legacyContactRules, choice];
  assert.throws(() => validateBookingRuleAnswers(rules, {}, contact), /Preferred style/);
  assert.throws(() => validateBookingRuleAnswers(rules, { style: "Forged" }, contact), /available option/);
  assert.throws(() => validateBookingRuleAnswers(rules, { style: "Candid", foreign: "value" }, contact), /does not belong/);
  const saved = validateBookingRuleAnswers(rules, { style: "Candid" }, contact);
  assert.match(saved, /Name: Test Client/);
  assert.match(saved, /Preferred style: Candid/);
  assert.throws(() => validateBookingRuleAnswers([...rules, { ...choice, id: "phone", type: "TEXT", contactField: "customerPhone" }], { style: "Candid" }, contact), /Preferred style/);
});
test("booking-rule migration is additive and saved sets are isolated by site", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Site" (id TEXT PRIMARY KEY); CREATE TABLE "Service" (id TEXT PRIMARY KEY,"intakePrompt" TEXT); INSERT INTO "Site" VALUES (\'a\'),(\'b\'); INSERT INTO "Service" VALUES (\'service\',\'Existing question\');');
    await db.exec(readFileSync("prisma/migrations/20261103010000_booking_rule_sets/migration.sql", "utf8"));
    assert.equal((await db.query<{ intakePrompt: string }>('SELECT "intakePrompt" FROM "Service"')).rows[0].intakePrompt, "Existing question");
    for (const site of ["a", "b"]) await db.query('INSERT INTO "BookingRuleSet" (id,"siteId",name,"nameKey",rules,"updatedAt") VALUES ($1,$2,\'Contact\',\'contact\',$3,CURRENT_TIMESTAMP)', [site, site, JSON.stringify(legacyContactRules)]);
    assert.equal((await db.query('SELECT id FROM "BookingRuleSet" WHERE "siteId"=\'a\'')).rows.length, 1);
    await assert.rejects(db.exec('INSERT INTO "BookingRuleSet" (id,"siteId",name,"nameKey",rules,"updatedAt") VALUES (\'dup\',\'a\',\'CONTACT\',\'contact\',\'[]\',CURRENT_TIMESTAMP)'), /unique/i);
  } finally { await db.close(); }
});
