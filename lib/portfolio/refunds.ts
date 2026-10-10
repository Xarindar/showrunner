import "server-only";
import { prisma } from "@/lib/prisma";

/** Called only with verified provider refund evidence, never client input. */
export async function revokeGalleryPurchaseForRefund(input: {
  orderId: string; siteId: string; amountCents: number; currency: string; paymentCurrency: string;
}) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return;
  const purchase = await prisma.portfolioSelectionPurchase.findFirst({
    where: { orderId: input.orderId, siteId: input.siteId }, select: { id: true }
  });
  if (!purchase) return; // Do not change refund behavior for unrelated commerce orders.
  if (!input.currency || input.currency.toUpperCase() !== input.paymentCurrency.toUpperCase()) {
    throw new Error("Gallery refund currency does not match the payment.");
  }
  // A first confirmed partial refund permanently revokes delivery. Replays and
  // later paid events cannot reset the timestamp, including concurrent events.
  await prisma.portfolioSelectionPurchase.updateMany({
    where: { orderId: input.orderId, siteId: input.siteId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export function payPalRefundCaptureId(resource: {
  supplementary_data?: { related_ids?: { capture_id?: string } };
  links?: Array<{ rel?: string; href?: string }>;
}) {
  const explicit = resource.supplementary_data?.related_ids?.capture_id;
  if (explicit && /^[A-Z0-9]{1,20}$/.test(explicit)) return explicit;
  for (const link of resource.links || []) {
    if (link.rel !== "up" || !link.href) continue;
    try {
      const url = new URL(link.href);
      if (url.protocol !== "https:" || !["api.paypal.com", "api-m.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"].includes(url.hostname)) continue;
      const match = /^\/v2\/payments\/captures\/([A-Z0-9]{1,20})$/.exec(url.pathname);
      if (match) return match[1];
    } catch { /* An invalid link is not capture identity evidence. */ }
  }
  return null;
}
