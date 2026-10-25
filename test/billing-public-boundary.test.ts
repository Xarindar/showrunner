import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("billing cannot queue customer links when the public document route is absent", () => {
  if (existsSync("app/billing/[token]/page.tsx")) return;
  const actions = readFileSync("modules/billing/actions.ts", "utf8");
  const page = readFileSync("modules/billing/page.tsx", "utf8");
  assert(!actions.includes("queueBillingDocumentEmail"), "Do not email links to a retired route");
  assert(!page.includes("queueBillingDocumentEmailAction"));
  assert(page.includes("setBillingCheckoutLinkAction"), "Keep the existing hosted payment handoff");
  assert(actions.includes("refundBillingPaymentAction"), "Keep refund handling");
});
