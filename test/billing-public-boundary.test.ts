import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public checkout links are scoped to booking invoices", () => {
  const route = readFileSync("lib/bookings/payment.ts", "utf8");
  assert.match(route, /where: \{ publicAccessToken: token, bookingId: \{ not: null \}, status: \{ not: "DRAFT" \} \}/);
  const actions = readFileSync("modules/billing/actions.ts", "utf8");
  const page = readFileSync("modules/billing/page.tsx", "utf8");
  assert(!actions.includes("queueBillingDocumentEmail"), "Do not email links to a retired route");
  assert(!page.includes("queueBillingDocumentEmailAction"));
  assert(page.includes("setBillingCheckoutLinkAction"), "Keep the existing hosted payment handoff");
  assert(actions.includes("refundBillingPaymentAction"), "Keep refund handling");
});
