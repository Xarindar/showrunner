/** Provider retrieval evidence, never a status supplied by the browser. */
export type GalleryCheckoutInspection =
  | { state: "OPEN"; checkoutUrl: string }
  | { state: "TERMINAL"; providerState: string }
  | { state: "WAITING" };

export type GalleryCheckoutIdentity = {
  siteId: string;
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  checkoutSessionId: string;
  externalPaymentId: string | null;
};

export function requireCheckoutIdentity(matches: boolean) {
  if (!matches) throw new Error("The provider checkout does not match this saved gallery purchase.");
}

export function safeHostedCheckoutUrl(value: string | null | undefined) {
  if (!value) throw new Error("The provider checkout URL is unavailable.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("The provider checkout URL is invalid.");
  return value;
}

/** Gallery gateway creation is reachable only for a persisted, bounded recovery attempt. */
export function assertGalleryCheckoutCreation(payment: { externalCheckoutSession: string | null; rawSummary: unknown }, now = Date.now()) {
  const summary = payment.rawSummary as { galleryCheckoutAttempt?: { startedAt?: unknown } } | null;
  const startedAt = summary?.galleryCheckoutAttempt?.startedAt;
  const started = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
  if (payment.externalCheckoutSession || !Number.isFinite(started) || started > now || now - started >= 5 * 60 * 60 * 1000) {
    throw new Error("Return to the gallery to verify the previous checkout before creating a payment session.");
  }
}
