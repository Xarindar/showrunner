import assert from "node:assert/strict";
import test from "node:test";
import { canSettleCanceledGalleryOrder, purchaseReleaseStatus, sameSelection, selectionQuote } from "../lib/portfolio/selection-policy";

test("package selection calculates exact included/extras; examples are never defaults", () => {
  assert.deepEqual(selectionQuote(3, 3, 750, "USD"), { extraCount: 0, totalCents: 0 });
  assert.deepEqual(selectionQuote(5, 3, 750, "USD"), { extraCount: 2, totalCents: 1500 });
  assert.deepEqual(selectionQuote(5, 3, 0, "EUR"), { extraCount: 2, totalCents: 0 });
  for (const args of [[0, 3, 750, "USD"], [2, -1, 750, "USD"], [2, 0, 1.5, "USD"], [2001, 0, 1, "USD"], [2, 0, 2147483647, "USD"], [2, 0, 1, "usd"], [2, 0, 1, "JPY"], [2, 0, 1, "KWD"], [2, 0, 1, "ZZZ"]] as const) assert.throws(() => selectionQuote(args[0], args[1], args[2], args[3]));
});

test("finalized IDs ignore order but reject changed or duplicate images", () => {
  assert.equal(sameSelection(["a", "b"], ["b", "a"]), true);
  assert.equal(sameSelection(["a", "b"], ["a", "c"]), false);
  assert.equal(sameSelection(["a", "a"], ["a", "a"]), false);
});

const evidence = { provider: "STRIPE", status: "PAID", amountCents: 1000, currency: "USD", refundedCents: 0, providerVerifiedAt: new Date(), externalPaymentId: "pi_test" };
const paid = { totalCents: 1000, currency: "USD", order: { status: "PAID", totalCents: 1000, currency: "USD", payments: [evidence] } };
test("included selection releases with no payment; extras need exact verified provider evidence", () => {
  assert.equal(purchaseReleaseStatus({ totalCents: 0, currency: "USD", order: null }), "RELEASED");
  assert.equal(purchaseReleaseStatus(paid), "RELEASED");
  for (const patch of [{ status: "PENDING" }, { providerVerifiedAt: null }, { amountCents: 999 }, { currency: "EUR" }, { provider: "MANUAL" }, { externalPaymentId: null }]) {
    assert.notEqual(purchaseReleaseStatus({ ...paid, order: { ...paid.order, payments: [{ ...evidence, ...patch }] } }), "RELEASED");
  }
});
test("failed, pending, cancelled and refunded payments fail closed even with past paid evidence", () => {
  assert.equal(purchaseReleaseStatus({ ...paid, order: { ...paid.order, status: "PENDING" } }), "PENDING");
  assert.equal(purchaseReleaseStatus({ ...paid, order: { ...paid.order, status: "CANCELED" } }), "BLOCKED");
  assert.equal(purchaseReleaseStatus({ ...paid, order: { ...paid.order, payments: [{ ...evidence, status: "FAILED" }] } }), "FAILED");
  assert.equal(purchaseReleaseStatus({ ...paid, order: { ...paid.order, payments: [{ ...evidence, refundedCents: 1 }] } }), "BLOCKED");
  assert.equal(purchaseReleaseStatus({ ...paid, order: { ...paid.order, status: "REFUNDED" } }), "REFUNDED");
  assert.equal(purchaseReleaseStatus({ ...paid, order: { ...paid.order, totalCents: 999 } }), "BLOCKED");
});

test("late paid callbacks settle only gallery canceled orders with exact verified funds", () => {
  const input = { isGallery: true, providerConfirmed: true, targetStatus: "PAID", order: { ...paid.order, status: "CANCELED" } };
  assert.equal(canSettleCanceledGalleryOrder(input), true);
  assert.equal(canSettleCanceledGalleryOrder({ ...input, isGallery: false }), false);
  assert.equal(canSettleCanceledGalleryOrder({ ...input, providerConfirmed: false }), false);
  assert.equal(canSettleCanceledGalleryOrder({ ...input, order: { ...input.order, payments: [{ ...evidence, providerVerifiedAt: null }] } }), false);
  assert.equal(canSettleCanceledGalleryOrder({ ...input, order: { ...input.order, payments: [{ ...evidence, currency: "EUR" }] } }), false);
});
