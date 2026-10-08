export function supportsPhotoCurrency(currency: string) {
  try {
    return Intl.supportedValuesOf("currency").includes(currency) && new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits === 2;
  } catch { return false; }
}

/** Shared pure policy. All prices are integer minor units, never client supplied. */
export function selectionQuote(count: number, allowance: number, extraPriceCents: number, currency: string) {
  if (![count, allowance, extraPriceCents].every(Number.isSafeInteger) || count < 1 || count > 2000 || allowance < 0 || extraPriceCents < 0 || (!/^[A-Z]{3}$/.test(currency) || !supportsPhotoCurrency(currency))) {
    throw new Error("Configure a valid package allowance, extra-photo price, and supported two-decimal currency.");
  }
  const extraCount = Math.max(0, count - allowance);
  const totalCents = extraCount * extraPriceCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > 2147483647) throw new Error("Selection total exceeds the supported amount.");
  return { extraCount, totalCents };
}

export function sameSelection(a: string[], b: string[]) {
  return a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
}

type PaymentEvidence = { provider: string; status: string; amountCents: number; currency: string; refundedCents: number; providerVerifiedAt: Date | null; externalPaymentId: string | null };
export function purchaseReleaseStatus(input: {
  totalCents: number; currency: string; order: null | { status: string; totalCents: number; currency: string; payments: PaymentEvidence[] };
}): "RELEASED" | "PENDING" | "FAILED" | "REFUNDED" | "BLOCKED" {
  if (input.totalCents === 0) return input.order ? "BLOCKED" : "RELEASED";
  const order = input.order;
  if (!order || order.totalCents !== input.totalCents || order.currency !== input.currency) return "BLOCKED";
  if (order.status === "REFUNDED" || order.payments.some(p => p.status === "REFUNDED")) return "REFUNDED";
  // Existing commerce reserves refundedCents before provider confirmation. Hold delivery,
  // but only verified refund handlers permanently revoke the purchase.
  if (order.payments.some(p => p.refundedCents > 0)) return "BLOCKED";
  if (order.status === "CANCELED") return "BLOCKED";
  const verified = order.payments.some(p => ["STRIPE", "SQUARE", "PAYPAL"].includes(p.provider) && p.status === "PAID" && p.providerVerifiedAt !== null && Boolean(p.externalPaymentId) && p.amountCents === input.totalCents && p.currency === input.currency);
  if (verified && ["PAID", "FULFILLED"].includes(order.status)) return "RELEASED";
  // Payment attempts are ordered newest first; an earlier failure does not cancel a fresh attempt.
  if (order.payments[0]?.status === "FAILED") return "FAILED";
  return "PENDING";
}

/** A late verified payment may settle its own canceled gallery order, never arbitrary canceled orders. */
export function canSettleCanceledGalleryOrder(input: {
  isGallery: boolean; providerConfirmed: boolean; targetStatus: string;
  order: { status: string; totalCents: number; currency: string; payments: PaymentEvidence[] };
}) {
  return input.isGallery && input.providerConfirmed && input.targetStatus === "PAID" && input.order.status === "CANCELED" && input.order.totalCents > 0 &&
    purchaseReleaseStatus({ totalCents: input.order.totalCents, currency: input.order.currency, order: { ...input.order, status: "PAID" } }) === "RELEASED";
}
