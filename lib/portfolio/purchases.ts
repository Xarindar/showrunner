import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { GalleryCheckoutRecoveryError, recoverGalleryCheckout } from "./checkout-recovery";
import { resolvePaymentProviderForSite } from "@/lib/payments/registry";
import { purchaseReleaseStatus, sameSelection, selectionQuote } from "./selection-policy";

export class ProofSelectionError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 503 = 400) { super(message); }
}
export type ProofSelectionView = {
  gallery: { id: string; slug: string; title: string; description: string | null };
  termsVersion: string;
  includedCount: number; extraImagePriceCents: number; currency: string;
  items: Array<{ id: string; title: string | null; altText: string | null }>;
  purchase: null | { id: string; status: string; selectedItemIds: string[]; includedCount: number; extraCount: number; extraImagePriceCents: number; totalCents: number; currency: string; checkoutUrl: string | null; canRetryCheckout: boolean; downloads: Array<{ itemId: string; filename: string; url: string }> };
};

const purchaseInclude = { selections: { include: { mediaAsset: true, item: true } }, order: { include: { payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } } } satisfies Prisma.PortfolioSelectionPurchaseInclude;

type Tx = Prisma.TransactionClient;
async function activeAccess(db: Tx, token: string, siteId: string) {
  return db.portfolioGalleryAccess.findFirst({
    where: { siteId, accessToken: token, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], gallery: { siteId, status: "PUBLISHED", visibility: "PRIVATE", clientId: { not: null } } },
    include: { gallery: { include: { packageProduct: true, purchasedOrder: { include: { items: true, gallerySelectionPurchase: { select: { id: true } } } }, items: { include: { mediaAsset: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, purchase: { include: purchaseInclude } } } }
  });
}
function validAccess(access: Awaited<ReturnType<typeof activeAccess>>) {
  return Boolean(access && access.clientId && access.clientId === access.gallery.clientId && access.gallery.proofingEnabled && access.gallery.selectionAllowance !== null && access.gallery.extraPhotoPriceCents !== null && access.gallery.selectionCurrency && access.gallery.packageProductId);
}
function validPackage(gallery: NonNullable<Awaited<ReturnType<typeof activeAccess>>>["gallery"]) {
  const order = gallery.purchasedOrder;
  return Boolean(order && !order.gallerySelectionPurchase && order.siteId === gallery.siteId && order.clientId === gallery.clientId && ["PAID", "FULFILLED"].includes(order.status) && order.items.some(item => item.productId === gallery.packageProductId) && gallery.packageProduct?.siteId === gallery.siteId && gallery.packageProduct.type === "SERVICE_PACKAGE");
}
function termsVersion(gallery: { selectionAllowance: number | null; extraPhotoPriceCents: number | null; selectionCurrency: string | null; packageProductId: string | null; purchasedOrderId?: string | null }) {
  return createHash("sha256").update(JSON.stringify([gallery.selectionAllowance, gallery.extraPhotoPriceCents, gallery.selectionCurrency, gallery.packageProductId, gallery.purchasedOrderId])).digest("hex");
}
function releaseStatus(purchase: Prisma.PortfolioSelectionPurchaseGetPayload<{ include: typeof purchaseInclude }>) {
  if (purchase.revokedAt) return "REFUNDED";
  if (purchase.order && (purchase.order.siteId !== purchase.siteId || purchase.order.clientId !== purchase.clientId)) return "BLOCKED";
  return purchaseReleaseStatus(purchase);
}

export async function getProofSelection(token: string): Promise<ProofSelectionView | null> {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio") || !token || token.length > 256) return null;
  const access = await activeAccess(prisma, token, settings.siteId);
  if (!validAccess(access) || !access || !validPackage(access.gallery)) return null;
  const gallery = access.gallery;
  const purchase = gallery.purchase;
  const status = purchase && validPackage(gallery) && purchase.clientId === access.clientId && purchase.siteId === settings.siteId ? releaseStatus(purchase) : "BLOCKED";
  const mediaBase = `/api/portfolio/galleries/${encodeURIComponent(gallery.slug)}/media/`;
  return {
    gallery: { id: gallery.id, slug: gallery.slug, title: gallery.title, description: gallery.description },
    termsVersion: termsVersion(gallery),
    includedCount: gallery.selectionAllowance!, extraImagePriceCents: gallery.extraPhotoPriceCents!, currency: gallery.selectionCurrency!,
    items: gallery.items.filter(item => item.type === "IMAGE" && item.isDownloadable && item.mediaAsset?.isPrivate && !item.mediaAsset.deletedAt && item.mediaAsset.siteId === settings.siteId && ["S3", "R2", "SERVER_ASSETS"].includes(item.mediaAsset.driver)).map(item => ({ id: item.id, title: item.title, altText: item.altText })),
    purchase: purchase ? {
      id: purchase.id, status, selectedItemIds: purchase.selections.map(s => s.itemId), includedCount: purchase.allowance, extraCount: purchase.extraCount, extraImagePriceCents: purchase.extraPriceCents, totalCents: purchase.totalCents, currency: purchase.currency,
      checkoutUrl: status === "PENDING" ? purchase.order?.checkoutUrl || null : null,
      canRetryCheckout: purchase.totalCents > 0 && !purchase.revokedAt && status !== "RELEASED" && status !== "REFUNDED" && Boolean(purchase.order && ["PENDING", "CANCELED"].includes(purchase.order.status) && purchase.order.siteId === settings.siteId && purchase.order.clientId === access.clientId && purchase.order.totalCents === purchase.totalCents && purchase.order.currency === purchase.currency),
      downloads: status === "RELEASED" && gallery.downloadEnabled ? purchase.selections.filter(s => s.item.galleryId === gallery.id && s.item.mediaAssetId === s.mediaAssetId && s.item.isDownloadable && s.mediaAsset.isPrivate && s.mediaAsset.siteId === settings.siteId && !s.mediaAsset.deletedAt).map(s => ({ itemId: s.itemId, filename: s.mediaAsset.filename, url: `${mediaBase}${encodeURIComponent(s.itemId)}?access=${encodeURIComponent(token)}&variant=DOWNLOAD&download=1` })) : []
    } : null
  };
}

/** Every download rechecks access, immutable asset identity, verified payment, and refunds. */
export async function authorizeGalleryOriginal(input: { siteId: string; galleryId: string; itemId: string; accessId: string; mediaAssetId?: string }) {
  const access = await prisma.portfolioGalleryAccess.findFirst({ where: { id: input.accessId, siteId: input.siteId, galleryId: input.galleryId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { accessToken: true } });
  if (!access) return false;
  const full = await activeAccess(prisma, access.accessToken, input.siteId);
  if (!full || !validAccess(full) || !validPackage(full.gallery) || !full.gallery.downloadEnabled) return false;
  const purchase = full.gallery.purchase;
  if (!purchase || purchase.siteId !== input.siteId || purchase.clientId !== full.clientId || releaseStatus(purchase) !== "RELEASED") return false;
  return purchase.selections.some(s => s.itemId === input.itemId && (!input.mediaAssetId || s.mediaAssetId === input.mediaAssetId) && s.item.galleryId === input.galleryId && s.item.mediaAssetId === s.mediaAssetId && s.item.isDownloadable && s.mediaAsset.siteId === input.siteId && s.mediaAsset.isPrivate && !s.mediaAsset.deletedAt);
}

export async function finalizeProofSelection(input: { token: string; itemIds: string[]; expectedTermsVersion: string }): Promise<{ purchaseId: string; checkoutUrl: string | null; status: string }> {
  if (!input.token || input.token.length > 256 || !Array.isArray(input.itemIds) || input.itemIds.length < 1 || input.itemIds.length > 2000 || input.itemIds.some(id => typeof id !== "string" || !id || id.length > 128) || new Set(input.itemIds).size !== input.itemIds.length) throw new ProofSelectionError("Choose a valid set of photos.");
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) throw new ProofSelectionError("Gallery unavailable.", 404);
  // Serialize different links/selections for one gallery; the unique gallery purchase is a second backstop.
  const purchase = await prisma.$transaction(async tx => {
    let access = await activeAccess(tx, input.token, settings.siteId);
    if (!access || !validAccess(access)) throw new ProofSelectionError("Gallery unavailable.", 404);
    await tx.$queryRaw`SELECT id FROM "PortfolioGallery" WHERE id = ${access.galleryId} FOR UPDATE`;
    access = await activeAccess(tx, input.token, settings.siteId);
    if (!access || !validAccess(access) || !validPackage(access.gallery)) throw new ProofSelectionError("Gallery package is unavailable. Contact your photographer.", 409);
    const gallery = access.gallery;
    if (gallery.purchase) {
      if (gallery.purchase.siteId !== settings.siteId || gallery.purchase.clientId !== access.clientId) throw new ProofSelectionError("This selection is unavailable for this client.", 404);
      if (!sameSelection(gallery.purchase.selections.map(s => s.itemId), input.itemIds)) throw new ProofSelectionError("This gallery already has a finalized selection. Refresh to view it.", 409);
      return gallery.purchase;
    }
    if (input.expectedTermsVersion !== termsVersion(gallery)) throw new ProofSelectionError("Package terms changed. Refresh and review the updated price before confirming.", 409);
    const selected = input.itemIds.map(id => gallery.items.find(item => item.id === id));
    if (selected.some(item => !item || item.type !== "IMAGE" || !item.isDownloadable || !item.mediaAsset?.isPrivate || item.mediaAsset.deletedAt || item.mediaAsset.siteId !== settings.siteId || !["S3", "R2", "SERVER_ASSETS"].includes(item.mediaAsset.driver))) throw new ProofSelectionError("One or more selected photos are unavailable.", 409);
    let quote;
    try { quote = selectionQuote(selected.length, gallery.selectionAllowance!, gallery.extraPhotoPriceCents!, gallery.selectionCurrency!); } catch (error) { throw new ProofSelectionError(error instanceof Error ? error.message : "Invalid package.", 409); }
    const client = await tx.client.findFirst({ where: { id: access.clientId!, siteId: settings.siteId } });
    if (!client) throw new ProofSelectionError("Client unavailable.", 404);
    const provider = quote.totalCents > 0 ? await resolvePaymentProviderForSite(settings.siteId) : null;
    if (provider && !["STRIPE", "SQUARE", "PAYPAL"].includes(provider)) throw new ProofSelectionError("Online payment is unavailable.", 503);
    const order = quote.totalCents > 0 ? await tx.order.create({ data: {
      siteId: settings.siteId, clientId: client.id, orderNumber: `PHOTO-${randomUUID()}`, customerName: client.name, customerEmail: client.email, status: "PENDING", currency: gallery.selectionCurrency!, subtotalCents: quote.totalCents, totalCents: quote.totalCents,
      items: { create: { productId: gallery.packageProductId!, name: `${gallery.title}: extra selected photos`, quantity: quote.extraCount, unitPriceCents: gallery.extraPhotoPriceCents!, lineTotalCents: quote.totalCents } },
      payments: { create: { provider: provider!, status: "PENDING", amountCents: quote.totalCents, currency: gallery.selectionCurrency! } }
    } }) : null;
    return tx.portfolioSelectionPurchase.create({ data: { galleryId: gallery.id, siteId: settings.siteId, clientId: client.id, packageProductId: gallery.packageProductId!, packageName: gallery.packageProduct!.name, allowance: gallery.selectionAllowance!, extraPriceCents: gallery.extraPhotoPriceCents!, currency: gallery.selectionCurrency!, ...quote, selectedCount: selected.length, orderId: order?.id, selections: { create: selected.map(item => ({ itemId: item!.id, mediaAssetId: item!.mediaAssetId! })) } }, include: purchaseInclude });
  }, { timeout: 15000 });
  const status = releaseStatus(purchase);
  if (status === "RELEASED" || status === "REFUNDED" || !purchase.orderId) return { purchaseId: purchase.id, checkoutUrl: null, status };
  try {
    return await recoverGalleryCheckout({ purchaseId: purchase.id, siteId: settings.siteId });
  } catch (error) {
    if (error instanceof GalleryCheckoutRecoveryError) throw new ProofSelectionError(error.message, error.status);
    throw error;
  }
}
