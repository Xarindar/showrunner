import assert from "node:assert/strict";
import test from "node:test";
import { optionalRecordId, nullableRecordId } from "../lib/record-id";
import { hourlyRateInputSchema } from "../lib/scheduling/pricing";
import { serviceLibraryInputSchema } from "../lib/scheduling/service-library";
import { bookingDocumentInputSchema, bookingDocumentSelectionSchema } from "../lib/scheduling/booking-documents";
import { sessionOfferingSchema } from "../lib/scheduling/session-offering";

test("optional IDs consistently accept omitted and blank form values while preserving valid IDs", () => {
  assert.equal(optionalRecordId.parse(undefined), undefined);
  assert.equal(nullableRecordId.parse(undefined), undefined);
  assert.equal(nullableRecordId.parse(null), null);
  for (const id of ["", " "]) {
    assert.equal(optionalRecordId.parse(id), undefined);
    assert.equal(nullableRecordId.parse(id), null);
    assert.equal(hourlyRateInputSchema.parse({ id, name: "Standard", amount: "25" }).id, undefined);
    assert.equal(serviceLibraryInputSchema.parse({ id, name: "Coverage", description: "", category: "", tags: "", availableAsAddOn: false }).id, undefined);
    const form = { id, name: "Session details", kind: "INTAKE", isDefault: false, rules: [{ id: "question", kind: "intake", category: "Session", label: "Goals", type: "TEXT", required: false, options: [] }] };
    assert.equal(bookingDocumentInputSchema.parse(form).id, undefined);
    assert.equal(bookingDocumentInputSchema.safeParse({ ...form, version: 2 }).success, false, "An edit with a missing ID cannot become a new document");
    const saved = sessionOfferingSchema.parse({ coverageItems: [{ id: "coverage", name: "Coverage", libraryItemId: id }], tiers: [{ id: "standard", name: "Standard", durationMinutes: 30, priceCents: null, hourlyRateId: id, coverageIds: ["coverage"] }], addOns: [] });
    assert.equal(saved.coverageItems[0].libraryItemId, undefined);
    assert.equal(saved.tiers[0].hourlyRateId, null);
  }
  assert.equal(optionalRecordId.parse(" rate "), "rate");
  assert.equal(nullableRecordId.parse("rate"), "rate");
  assert.equal(optionalRecordId.safeParse(123).success, false);
  assert.equal(optionalRecordId.safeParse("x".repeat(101)).success, false);
  assert.equal(bookingDocumentSelectionSchema.safeParse({ intake: "", terms: "default" }).success, false, "A real selector must choose default, none, or an existing document");
  assert.equal(sessionOfferingSchema.safeParse({ coverageItems: [], tiers: [{ id: "", name: "Standard", durationMinutes: 30, priceCents: null, coverageIds: [] }], addOns: [] }).success, false, "Required package IDs remain required");
});
