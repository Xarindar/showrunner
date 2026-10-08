import "server-only";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPaymentCheckoutSessionForOrder } from "@/lib/payments/checkout";
import { inspectStripeGalleryCheckout } from "@/lib/commerce/stripe";
import { inspectPayPalGalleryCheckout } from "@/lib/commerce/paypal";
import { inspectSquareGalleryCheckout } from "@/lib/commerce/square";
import { purchaseReleaseStatus } from "./selection-policy";
import type { GalleryCheckoutInspection } from "./checkout-recovery-policy";

const LEASE_MS = 2 * 60 * 1000;
// Below PayPal's documented six-hour and Stripe's 24-hour retention windows.
// Unknown Square outcomes require reconciliation; its link API does not promise a retention window.
const SAFE_REPLAY_MS = 5 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const purchaseInclude = { order: { include: { payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } } } satisfies Prisma.PortfolioSelectionPurchaseInclude;
type Purchase = Prisma.PortfolioSelectionPurchaseGetPayload<{ include: typeof purchaseInclude }>;
type Tx = Prisma.TransactionClient;
type Result = { purchaseId: string; checkoutUrl: string | null; status: string };

export class GalleryCheckoutRecoveryError extends Error {
  constructor(message: string, public status: 409 | 503 = 409) { super(message); }
}

function object(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}
function result(purchase: Purchase, status: string, checkoutUrl: string | null = null): Result {
  return { purchaseId: purchase.id, status, checkoutUrl };
}
function settledResult(purchase: Purchase): Result | null {
  if (purchase.revokedAt) return result(purchase, "REFUNDED");
  if (purchase.totalCents === 0 && !purchase.orderId) return result(purchase, "RELEASED");
  const order = purchase.order;
  if (!order || order.siteId !== purchase.siteId || order.clientId !== purchase.clientId ||
      order.totalCents !== purchase.totalCents || order.currency !== purchase.currency || purchase.totalCents <= 0 || !order.payments.length ||
      order.payments.some(payment => payment.amountCents !== purchase.totalCents || payment.currency !== purchase.currency)) {
    throw new GalleryCheckoutRecoveryError("Payment details need review. Contact your photographer before trying again.");
  }
  const status = purchaseReleaseStatus(purchase);
  if (status === "RELEASED" || status === "REFUNDED") return result(purchase, status);
  if (order.payments.some(payment => payment.refundedCents > 0)) return result(purchase, "BLOCKED");
  // A local failure is never proof of a void. Any recorded funds must finish reconciling.
  if (["PAID", "FULFILLED"].includes(order.status) || order.payments.some(payment =>
    payment.status === "PAID" || payment.status === "AUTHORIZED" || payment.providerVerifiedAt !== null)) return result(purchase, "PENDING");
  if (!["PENDING", "DRAFT", "CANCELED"].includes(order.status)) throw new GalleryCheckoutRecoveryError("Payment needs review. Contact your photographer.");
  return null;
}
async function lockedPurchase(tx: Tx, input: { purchaseId: string; siteId: string }): Promise<Purchase> {
  await tx.$queryRaw`SELECT id FROM "PortfolioSelectionPurchase" WHERE id = ${input.purchaseId} AND "siteId" = ${input.siteId} FOR UPDATE`;
  const purchase = await tx.portfolioSelectionPurchase.findFirst({ where: { id: input.purchaseId, siteId: input.siteId }, include: purchaseInclude });
  if (!purchase) throw new GalleryCheckoutRecoveryError("Selection unavailable. Return to your gallery link.");
  if (purchase.orderId) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${purchase.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "orderId" = ${purchase.orderId} FOR UPDATE`;
    return tx.portfolioSelectionPurchase.findFirstOrThrow({ where: { id: input.purchaseId, siteId: input.siteId }, include: purchaseInclude });
  }
  return purchase;
}

/** Called only after the private-gallery access and immutable selection were validated. */
export async function recoverGalleryCheckout(input: { purchaseId: string; siteId: string }): Promise<Result> {
  const lease = new Date();
  const claim = await prisma.$transaction(async tx => {
    const purchase = await lockedPurchase(tx, input);
    const settled = settledResult(purchase);
    if (settled) return { response: settled };
    if (purchase.checkoutStartedAt && lease.getTime() - purchase.checkoutStartedAt.getTime() < LEASE_MS) return { response: result(purchase, "PENDING") };
    const previous = purchase.order!.payments[0];
    const previousSummary = object(previous.rawSummary);
    if (purchase.checkoutStartedAt && !previous.externalCheckoutSession && typeof object(previousSummary.galleryCheckoutAttempt ?? null).startedAt !== "string") {
      // Persist uncertainty before releasing the old lease. A second click must
      // not turn an untracked legacy attempt into an apparently first attempt.
      await tx.payment.update({ where: { id: previous.id }, data: { rawSummary: { ...previousSummary, galleryCheckoutAttempt: { legacyUnverified: true } } } });
    }
    await tx.portfolioSelectionPurchase.update({ where: { id: purchase.id }, data: { checkoutStartedAt: lease } });
    return { purchase };
  });
  if (claim.response) return claim.response;
  const snapshot = claim.purchase!;
  const attempt = snapshot.order!.payments[0];
  let inspection: GalleryCheckoutInspection | null = null;
  try {
    if (attempt.externalCheckoutSession) {
      const identity = {
        siteId: input.siteId, orderId: snapshot.orderId!, paymentId: attempt.id,
        amountCents: snapshot.totalCents, currency: snapshot.currency,
        checkoutSessionId: attempt.externalCheckoutSession, externalPaymentId: attempt.externalPaymentId
      };
      if (attempt.provider === "STRIPE") inspection = await inspectStripeGalleryCheckout(identity);
      else if (attempt.provider === "PAYPAL") inspection = await inspectPayPalGalleryCheckout(identity);
      else if (attempt.provider === "SQUARE") inspection = await inspectSquareGalleryCheckout(identity);
      else throw new GalleryCheckoutRecoveryError("This payment provider cannot renew gallery checkout. Contact your photographer.");
    }
    const prepared = await prisma.$transaction(async tx => {
      const current = await lockedPurchase(tx, input);
      const settled = settledResult(current);
      if (settled) return { response: settled };
      if (current.checkoutStartedAt?.getTime() !== lease.getTime() || current.order!.payments[0].id !== attempt.id) return { response: result(current, "PENDING") };
      const payment = current.order!.payments[0];
      if (current.order!.payments.slice(1).some(older => older.status !== "FAILED" || !object(object(older.rawSummary).galleryRecovery ?? null).verifiedTerminalAt)) {
        throw new GalleryCheckoutRecoveryError("An earlier payment still needs verification. Contact your photographer before trying again.");
      }
      // A concurrent provider response changed the attempt after our inspection.
      if (payment.externalCheckoutSession !== attempt.externalCheckoutSession) return { response: result(current, "PENDING") };
      if (inspection?.state === "WAITING") {
        await tx.order.update({ where: { id: current.orderId! }, data: { status: "PENDING", checkoutUrl: null } });
        return { response: result(current, "PENDING") };
      }
      if (inspection?.state === "OPEN") {
        await tx.order.update({ where: { id: current.orderId! }, data: { status: "PENDING", checkoutUrl: inspection.checkoutUrl } });
        await tx.payment.update({ where: { id: payment.id }, data: { status: "PENDING" } });
        return { response: result(current, "PENDING", inspection.checkoutUrl) };
      }
      let nextPaymentId = payment.id;
      if (inspection?.state === "TERMINAL") {
        if (current.order!.payments.length >= MAX_ATTEMPTS) throw new GalleryCheckoutRecoveryError("Checkout has been renewed several times. Contact your photographer to review payment before another attempt.");
        await tx.payment.update({ where: { id: payment.id }, data: {
          status: "FAILED", rawSummary: { ...object(payment.rawSummary), galleryRecovery: { terminalState: inspection.providerState, verifiedTerminalAt: new Date().toISOString() } }
        } });
        const next = await tx.payment.create({ data: {
          orderId: current.orderId!, provider: payment.provider, status: "PENDING", amountCents: current.totalCents, currency: current.currency,
          rawSummary: { galleryCheckoutAttempt: { startedAt: lease.toISOString() } }
        } });
        nextPaymentId = next.id;
      } else {
        // No saved session may be an interrupted provider call, never proof that nothing was created.
        if (payment.externalPaymentId || !["STRIPE", "PAYPAL", "SQUARE"].includes(payment.provider)) {
          throw new GalleryCheckoutRecoveryError("The previous checkout needs verification. Contact your photographer before trying again.");
        }
        const summary = object(payment.rawSummary);
        const marker = object(summary.galleryCheckoutAttempt ?? null);
        if (marker.legacyUnverified || (summary.galleryCheckoutAttempt !== undefined && typeof marker.startedAt !== "string") ||
            (snapshot.checkoutStartedAt && typeof marker.startedAt !== "string")) {
          throw new GalleryCheckoutRecoveryError("The previous checkout could not be verified safely. Contact your photographer to reconcile that attempt before trying again.");
        }
        const previousStart = typeof marker.startedAt === "string" ? new Date(marker.startedAt) : null;
        if (previousStart && (payment.provider === "SQUARE" || !Number.isFinite(previousStart.getTime()) || Date.now() - previousStart.getTime() >= SAFE_REPLAY_MS)) {
          throw new GalleryCheckoutRecoveryError("The previous checkout could not be verified safely. Contact your photographer to reconcile that attempt before trying again.");
        }
        await tx.payment.update({ where: { id: payment.id }, data: {
          status: PaymentStatus.PENDING,
          rawSummary: { ...summary, galleryCheckoutAttempt: { startedAt: (previousStart || lease).toISOString() } }
        } });
      }
      await tx.order.update({ where: { id: current.orderId! }, data: { status: "PENDING", checkoutUrl: null } });
      return { orderId: current.orderId!, provider: payment.provider, paymentId: nextPaymentId };
    });
    if (prepared.response) return prepared.response;
    // Retry the same persisted payment/idempotency key after a short ambiguous outage.
    // A fresh key is created only after the old provider session was proved terminal.
    await createPaymentCheckoutSessionForOrder({ orderId: prepared.orderId!, siteId: input.siteId, provider: prepared.provider });
    return await prisma.$transaction(async tx => {
      const current = await lockedPurchase(tx, input);
      const settled = settledResult(current);
      if (settled) return settled;
      if (current.order!.payments[0].id !== prepared.paymentId) return result(current, "PENDING");
      return result(current, "PENDING", current.order!.checkoutUrl);
    });
  } catch (error) {
    if (error instanceof GalleryCheckoutRecoveryError) throw error;
    throw new GalleryCheckoutRecoveryError("Your selection is saved. Payment verification is temporarily unavailable. Try again shortly; if it continues, contact your photographer.", 503);
  } finally {
    // Only this lease owner can release it; never clear a newer request's lease.
    await prisma.portfolioSelectionPurchase.updateMany({ where: { id: input.purchaseId, siteId: input.siteId, checkoutStartedAt: lease }, data: { checkoutStartedAt: null } });
  }
}
