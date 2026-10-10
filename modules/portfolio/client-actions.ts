"use server";

import { randomUUID } from "node:crypto";
import { MediaVariantType, OrderStatus, PortfolioAccessStatus, PortfolioGalleryStatus, PortfolioGalleryVisibility, PortfolioItemType, ProductType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdminCan, getAccessibleClientWhere, getAccessibleGalleryWhere, getAccessibleMediaWhere, getOwnerStaffIds, hasAdminPermission, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl, supportsPrivateMediaDriver, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { slugify } from "@/lib/slug";
import {
  clientGalleryAddSchema, clientGalleryBrowseSchema, clientGalleryCreateSchema, clientGalleryImageTypes, clientGalleryPageSize,
  clientGalleryTargetSchema, clientGalleryUploadMaxBytes, clientGalleryUploadMaxPixels, type ClientGalleryPhotoPage, type ClientGalleryResult, type ClientGalleryWorkspace
} from "./client-gallery-validation";

class GalleryInputError extends Error {}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message || "Check the gallery details." };
  if (error instanceof GalleryInputError) return { ok: false, error: error.message };
  console.error("Client gallery action failed", error);
  return { ok: false, error: "The gallery could not be updated. Your existing photos are safe. Please try again." };
}

async function context() {
  const user = await requireAdmin("portfolio:manage");
  assertAdminCan(user, "clients:manage");
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) throw new GalleryInputError("Enable Portfolio before managing client galleries.");
  return { user, settings, siteId: settings.siteId };
}

async function accessibleClient(ctx: Awaited<ReturnType<typeof context>>, clientId: string) {
  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(ctx.user, ctx.siteId, { id: clientId }),
    select: { id: true, name: true, email: true }
  });
  if (!client) throw new GalleryInputError("This client is unavailable or outside your access scope.");
  return client;
}

async function accessibleGallery(ctx: Awaited<ReturnType<typeof context>>, clientId: string, galleryId: string) {
  await accessibleClient(ctx, clientId);
  const where = await getAccessibleGalleryWhere(ctx.user, ctx.siteId, {
    id: galleryId, clientId, visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED
  });
  const gallery = await prisma.portfolioGallery.findFirst({ where, select: { id: true, title: true, slug: true } });
  if (!gallery) throw new GalleryInputError("This private client gallery is unavailable or outside your access scope.");
  return { gallery, where };
}

function refresh(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/modules/media");
  revalidatePath("/admin/modules/portfolio");
}

export async function getClientGalleryWorkspace(clientId: string): Promise<ClientGalleryWorkspace> {
  const ctx = await context();
  await accessibleClient(ctx, clientId);
  const [galleries, orderItems] = await Promise.all([
    prisma.portfolioGallery.findMany({
      where: await getAccessibleGalleryWhere(ctx.user, ctx.siteId, { clientId, visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED }),
      include: {
        _count: { select: { items: true } },
        packageProduct: { select: { name: true } },
        accesses: {
          where: { siteId: ctx.siteId, clientId, status: PortfolioAccessStatus.ACTIVE, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { accessToken: true }, orderBy: { createdAt: "desc" }, take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.orderItem.findMany({
      where: {
        order: { siteId: ctx.siteId, clientId, status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] }, gallerySelectionPurchase: { is: null } },
        product: { siteId: ctx.siteId, type: ProductType.SERVICE_PACKAGE }
      },
      select: {
        productId: true, orderId: true, name: true,
        order: { select: { orderNumber: true, currency: true } },
        product: { select: { photoSelectionAllowance: true, extraPhotoPriceCents: true, currency: true } }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const canManageMedia = hasAdminPermission(ctx.user, "media:manage") && ctx.settings.enabledModuleIds.includes("media");
  const seen = new Set<string>();
  return {
    galleries: galleries.map((gallery) => ({
      id: gallery.id, title: gallery.title, photoCount: gallery._count.items, packageName: gallery.packageProduct?.name || "Package unavailable",
      selectionAllowance: gallery.selectionAllowance, extraPhotoPriceCents: gallery.extraPhotoPriceCents, selectionCurrency: gallery.selectionCurrency,
      accessPath: gallery.accesses[0] ? `/proofs/${encodeURIComponent(gallery.accesses[0].accessToken)}` : null
    })),
    packages: orderItems.filter((item) => {
      const key = `${item.orderId}:${item.productId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => ({
      productId: item.productId, orderId: item.orderId, name: item.name, orderNumber: item.order.orderNumber,
      allowance: item.product.photoSelectionAllowance, extraPhotoPriceCents: item.product.extraPhotoPriceCents, currency: item.product.currency
    })),
    canManageMedia,
    canUpload: canManageMedia && supportsPrivateMediaDriver(ctx.settings.mediaDriver) && isMediaUploadDriverConfigured(ctx.settings.mediaDriver)
  };
}

export async function createClientGalleryAction(raw: unknown): Promise<ClientGalleryResult<{ galleryId: string }>> {
  const ctx = await context();
  try {
    const input = clientGalleryCreateSchema.parse(raw);
    const client = await accessibleClient(ctx, input.clientId);
    if (!z.email().safeParse(client.email).success) throw new GalleryInputError("Add a valid client email before creating a private access link.");
    const purchasedPackage = await prisma.orderItem.findFirst({
      where: {
        productId: input.packageProductId, orderId: input.purchasedOrderId,
        order: { siteId: ctx.siteId, clientId: client.id, status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] }, gallerySelectionPurchase: { is: null } },
        product: { siteId: ctx.siteId, type: ProductType.SERVICE_PACKAGE }
      }, select: { id: true }
    });
    if (!purchasedPackage) throw new GalleryInputError("Choose a service package from a paid or fulfilled order belonging to this client.");
    const ownerIds = await getOwnerStaffIds(ctx.user, ctx.siteId);
    if ((await resolveDataScopeMode(ctx.user, ctx.siteId, "portfolio")) === "OWN" && !ownerIds.length) {
      throw new GalleryInputError("Link your admin account to an active staff profile before creating a gallery.");
    }
    const requestWhere = await getAccessibleGalleryWhere(ctx.user, ctx.siteId, {
      id: input.requestId, clientId: client.id, title: input.title, packageProductId: input.packageProductId,
      purchasedOrderId: input.purchasedOrderId, selectionAllowance: input.selectionAllowance,
      extraPhotoPriceCents: input.extraPhotoPrice, selectionCurrency: input.selectionCurrency,
      visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED
    });
    const previous = await prisma.portfolioGallery.findFirst({ where: requestWhere });
    if (previous) return { ok: true, data: { galleryId: previous.id } };
    const gallery = await prisma.portfolioGallery.create({
      data: {
        id: input.requestId, siteId: ctx.siteId, clientId: client.id, photographerId: ownerIds[0], title: input.title,
        slug: `${slugify(input.title).slice(0, 80) || "shoot"}-${randomUUID()}`,
        packageProductId: input.packageProductId, purchasedOrderId: input.purchasedOrderId,
        selectionAllowance: input.selectionAllowance, extraPhotoPriceCents: input.extraPhotoPrice, selectionCurrency: input.selectionCurrency,
        visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED,
        proofingEnabled: true, downloadEnabled: true, publishedAt: new Date(),
        proofRounds: { create: { siteId: ctx.siteId, roundNumber: 1, title: "Client selection" } },
        accesses: { create: { siteId: ctx.siteId, clientId: client.id, recipientEmail: client.email.trim().toLowerCase(), accessToken: randomUUID() } }
      }, select: { id: true }
    }).catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // The same submission can race after a retry; reuse only its exact scoped result.
        const existing = await prisma.portfolioGallery.findFirst({ where: requestWhere, select: { id: true } });
        if (existing) return existing;
      }
      throw error;
    });
    refresh(client.id);
    return { ok: true, data: { galleryId: gallery.id } };
  } catch (error) { return failure(error); }
}

export async function browseClientGalleryMediaAction(raw: unknown): Promise<ClientGalleryResult<ClientGalleryPhotoPage>> {
  const ctx = await context();
  assertAdminCan(ctx.user, "media:manage");
  try {
    const input = clientGalleryBrowseSchema.parse(raw);
    const { gallery } = await accessibleGallery(ctx, input.clientId, input.galleryId);
    const galleryItems = await prisma.portfolioGalleryItem.findMany({ where: { galleryId: gallery.id }, select: { mediaAssetId: true } });
    const existingIds = galleryItems.flatMap((item) => item.mediaAssetId ? [item.mediaAssetId] : []);
    const where = await getAccessibleMediaWhere(ctx.user, ctx.siteId, {
      deletedAt: null, isPrivate: true, mimeType: { in: [...clientGalleryImageTypes] }, driver: { in: ["SERVER_ASSETS", "S3", "R2"] },
      ...(input.mode === "gallery" ? { id: { in: existingIds } } : {}),
      ...(input.query ? { OR: [
        { filename: { contains: input.query, mode: "insensitive" as const } },
        { alt: { contains: input.query, mode: "insensitive" as const } },
        { caption: { contains: input.query, mode: "insensitive" as const } },
        { folder: { contains: input.query, mode: "insensitive" as const } },
        { tags: { array_contains: [input.query.toLowerCase()] } }
      ] } : {})
    });
    const total = await prisma.mediaAsset.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / clientGalleryPageSize));
    const page = Math.min(input.page, pageCount);
    const assets = await prisma.mediaAsset.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * clientGalleryPageSize, take: clientGalleryPageSize
    });
    const included = new Set(existingIds);
    return { ok: true, data: {
      assets: assets.map((asset) => ({
        id: asset.id, filename: asset.filename, alt: asset.alt || asset.filename, folder: asset.folder,
        thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.THUMBNAIL), alreadyAdded: included.has(asset.id)
      })), page, pageCount, total
    } };
  } catch (error) { return failure(error); }
}

async function addAssets(ctx: Awaited<ReturnType<typeof context>>, clientId: string, galleryId: string, assetIds: string[]) {
  const { gallery, where } = await accessibleGallery(ctx, clientId, galleryId);
  const ids = [...new Set(assetIds)];
  const assets = await prisma.mediaAsset.findMany({
    where: await getAccessibleMediaWhere(ctx.user, ctx.siteId, {
      id: { in: ids }, deletedAt: null, isPrivate: true, mimeType: { in: [...clientGalleryImageTypes] }, driver: { in: ["SERVER_ASSETS", "S3", "R2"] }
    })
  });
  if (assets.length !== ids.length) throw new GalleryInputError("Choose active private images from your accessible Media library. Public originals cannot be protected by a private gallery.");
  return prisma.$transaction(async (tx) => {
    // Lock this gallery before checking duplicates so repeated or concurrent adds are safe.
    const locked = await tx.portfolioGallery.updateMany({ where, data: { updatedAt: new Date() } });
    if (!locked.count) throw new GalleryInputError("The gallery is no longer available.");
    const existing = await tx.portfolioGalleryItem.findMany({ where: { galleryId: gallery.id }, select: { mediaAssetId: true, sortOrder: true } });
    const existingIds = new Set(existing.map((item) => item.mediaAssetId));
    const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
    const pending = assets.filter((asset) => !existingIds.has(asset.id));
    if (pending.length) await tx.portfolioGalleryItem.createMany({ data: pending.map((asset, index) => ({
      galleryId: gallery.id, mediaAssetId: asset.id, type: PortfolioItemType.IMAGE,
      title: asset.filename, altText: asset.alt || asset.filename, imageUrl: asset.url, thumbnailUrl: asset.url,
      isDownloadable: true, sortOrder: nextSortOrder + index
    })) });
    return pending.length;
  });
}

export async function addClientGalleryMediaAction(raw: unknown): Promise<ClientGalleryResult<{ added: number }>> {
  const ctx = await context();
  assertAdminCan(ctx.user, "media:manage");
  try {
    const input = clientGalleryAddSchema.parse(raw);
    const added = await addAssets(ctx, input.clientId, input.galleryId, input.assetIds);
    refresh(input.clientId);
    return { ok: true, data: { added } };
  } catch (error) { return failure(error); }
}

export async function uploadClientGalleryPhotoAction(formData: FormData): Promise<ClientGalleryResult<{ assetId: string; added: number }>> {
  const ctx = await context();
  assertAdminCan(ctx.user, "media:manage");
  try {
    const input = clientGalleryTargetSchema.parse({ clientId: formData.get("clientId"), galleryId: formData.get("galleryId") });
    const { gallery } = await accessibleGallery(ctx, input.clientId, input.galleryId);
    if (!supportsPrivateMediaDriver(ctx.settings.mediaDriver) || !isMediaUploadDriverConfigured(ctx.settings.mediaDriver)) {
      throw new GalleryInputError("Configure private server, S3, or R2 storage before uploading originals.");
    }
    if (formData.getAll("file").length !== 1 || [...formData.values()].filter(value => value instanceof File).length !== 1) throw new GalleryInputError("Upload exactly one photo per request; batches upload sequentially.");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw new GalleryInputError("Choose an image to upload.");
    if (file.size > clientGalleryUploadMaxBytes) throw new GalleryInputError("This image exceeds the 25 MiB per-photo limit.");
    if (!(clientGalleryImageTypes as readonly string[]).includes(file.type)) throw new GalleryInputError("Choose a JPG, PNG, WebP, or GIF image.");
    const ownerIds = await getOwnerStaffIds(ctx.user, ctx.siteId);
    if ((await resolveDataScopeMode(ctx.user, ctx.siteId, "media")) === "OWN" && !ownerIds.length) {
      throw new GalleryInputError("Link your admin account to a staff profile before uploading scoped media.");
    }
    const asset = await uploadMedia(file, {
      isPrivate: true, alt: file.name.replace(/\.[^.]+$/, ""), folder: `Client shoots/${input.clientId}/${gallery.id}`,
      usageContext: `Client shoot: ${gallery.title}`, uploadedByStaffId: ownerIds[0]
    }, ctx.settings.mediaDriver, ctx.siteId, { allowedMimeTypes: clientGalleryImageTypes, maxBytes: clientGalleryUploadMaxBytes, maxPixels: clientGalleryUploadMaxPixels, requireImage: true });
    try {
      const added = await addAssets(ctx, input.clientId, gallery.id, [asset.id]);
      refresh(input.clientId);
      return { ok: true, data: { assetId: asset.id, added } };
    } catch {
      refresh(input.clientId);
      return { ok: false, error: `${file.name} was saved privately to Media, but could not be added to this gallery. Choose it from Media to retry without uploading again.` };
    }
  } catch (error) {
    if (error instanceof Error && /pixel limit|supported pixel dimensions/i.test(error.message)) return { ok: false, error: "This image exceeds the 80-megapixel proofing limit." };
    return failure(error);
  }
}

export async function createClientGalleryLinkAction(raw: unknown): Promise<ClientGalleryResult<{ accessPath: string }>> {
  const ctx = await context();
  try {
    const input = clientGalleryTargetSchema.parse(raw);
    const client = await accessibleClient(ctx, input.clientId);
    const { gallery, where } = await accessibleGallery(ctx, input.clientId, input.galleryId);
    if (!z.email().safeParse(client.email).success) throw new GalleryInputError("Add a valid client email before creating a private access link.");
    const access = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const locked = await tx.portfolioGallery.updateMany({ where, data: { updatedAt: new Date() } });
      if (!locked.count) throw new GalleryInputError("The gallery is no longer available.");
      const existing = await tx.portfolioGalleryAccess.findFirst({
        where: { siteId: ctx.siteId, galleryId: gallery.id, clientId: client.id, status: PortfolioAccessStatus.ACTIVE, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
      });
      return existing || tx.portfolioGalleryAccess.create({ data: {
        siteId: ctx.siteId, galleryId: gallery.id, clientId: client.id, recipientEmail: client.email.trim().toLowerCase(), accessToken: randomUUID()
      } });
    });
    refresh(input.clientId);
    return { ok: true, data: { accessPath: `/proofs/${encodeURIComponent(access.accessToken)}` } };
  } catch (error) { return failure(error); }
}
