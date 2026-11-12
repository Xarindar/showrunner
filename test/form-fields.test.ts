import assert from "node:assert/strict";
import test from "node:test";
import { moveFormField } from "../lib/scheduling/form-fields";
import { bookingDocumentInputSchema } from "../lib/scheduling/booking-documents";
import { validateBookingRuleAnswers } from "../lib/scheduling/booking-rules";

test("reordering fields preserves IDs, answers, validation and the saved order without mutating the draft", () => {
  const draft = bookingDocumentInputSchema.parse({ name: "Session preparation", kind: "INTAKE", isDefault: false, rules: [
    { id: "goals", kind: "intake", category: "Session", label: "Your goals", type: "TEXT", required: true, options: [] },
    { id: "style", kind: "intake", category: "Session", label: "Style", type: "RADIO", required: false, options: ["Candid", "Posed"] },
    { id: "location", kind: "intake", category: "Session", label: "Location", type: "SELECT", required: false, options: ["Studio", "Outside"] }
  ] });
  const rules = moveFormField(draft.rules, "goals", "location");
  assert.deepEqual(rules.map(rule => rule.id), ["style", "location", "goals"]);
  assert.deepEqual(draft.rules.map(rule => rule.id), ["goals", "style", "location"]);
  assert.equal(rules[2], draft.rules[0]);
  assert.deepEqual(bookingDocumentInputSchema.parse({ ...draft, rules }).rules, rules);
  assert.deepEqual(moveFormField(rules, "goals", "style").map(rule => rule.id), ["goals", "style", "location"]);
  assert.equal(moveFormField(rules, "missing", "style"), rules);
  assert.equal(moveFormField(rules, "style", "style"), rules);
});

test("checkboxes and dates survive form saving and validate typed booking answers", () => {
  const document = bookingDocumentInputSchema.parse({ name: "Preparation", kind: "INTAKE", isDefault: false, rules: [
    { id: "people", kind: "intake", category: "Session", label: "Who is joining?", type: "CHECKBOX", width: "HALF", required: true, options: ["Adults", "Children"] },
    { id: "date", kind: "intake", category: "Session", label: "Preferred date", type: "DATE", width: "HALF", required: true, options: [] }
  ] });
  const contact = { customerName: "Test", customerEmail: "test@example.com" };
  const valid = { people: ["Adults", "Children"], date: "2028-02-29" };
  assert.match(validateBookingRuleAnswers(document.rules, valid, contact), /Adults, Children/);
  assert.throws(() => validateBookingRuleAnswers(document.rules, { ...valid, people: [] }, contact), /Answer/);
  assert.throws(() => validateBookingRuleAnswers(document.rules, { ...valid, people: "Adults" }, contact), /available options/);
  assert.throws(() => validateBookingRuleAnswers(document.rules, { ...valid, people: ["Other"] }, contact), /available options/);
  assert.throws(() => validateBookingRuleAnswers(document.rules, { ...valid, people: ["Adults", "Adults"] }, contact), /available options/);
  assert.throws(() => validateBookingRuleAnswers(document.rules, { ...valid, date: "2027-02-29" }, contact), /valid date/);
  assert.throws(() => validateBookingRuleAnswers(document.rules, { ...valid, date: ["2028-02-29"] }, contact), /single answer/);
  assert.deepEqual(document.rules.map(rule => rule.width), ["HALF", "HALF"]);
  assert.equal(bookingDocumentInputSchema.safeParse({ ...document, rules: [{ ...document.rules[0], width: "ARBITRARY" }] }).success, false);
  const consent = bookingDocumentInputSchema.parse({ ...document, rules: [{ ...document.rules[0], options: ["Please contact me"] }] });
  assert.match(validateBookingRuleAnswers(consent.rules, { people: ["Please contact me"] }, contact), /Please contact me/);
});
