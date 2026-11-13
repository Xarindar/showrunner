"use server";

import { randomUUID } from "node:crypto";
import { EmailCategory, MediaVariantType, OrderStatus, PortfolioAccessStatus, PortfolioGalleryStatus, PortfolioGalleryVisibility, PortfolioItemType, ProductType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdminCan, getAccessibleBookingWhere, getAccessibleClientWhere, getAccessibleGalleryWhere, getAccessibleMediaWhere, getOwnerStaffIds, hasAdminPermission, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { galleryProofResponse, isMediaUploadDriverConfigured, mediaAssetDisplayUrl, supportsPrivateMediaDriver, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { getZonedDateKey } from "@/lib/timezone";
import { serviceLibraryItemSchema } from "@/lib/scheduling/service-library";
import { sessionPackageSnapshotSchema, sessionDeliverablesSchema } from "@/lib/scheduling/session-offering";
import { purchaseReleaseStatus, supportsPhotoCurrency } from "@/lib/portfolio/selection-policy";
import { slugify } from "@/lib/slug";
import { queueEmail } from "@/lib/email";
import { publicAppBaseUrl } from "@/lib/env";
import {
  clientGalleryImageStatus, clientSessionPhotoFilename, clientPhotoProcessingTimeoutMs, clientSessionFolderName, mediaFolderSegment, clientGalleryAddSchema, clientGalleryBrowseSchema, clientGalleryCreateSchema, clientGalleryImageTypes, clientGalleryPageSize,
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
  const client = await accessibleClient(ctx, clientId);
  const where = await getAccessibleGalleryWhere(ctx.user, ctx.siteId, {
    id: galleryId, clientId, visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED
  });
  const gallery = await prisma.portfolioGallery.findFirst({ where, select: { id: true, title: true, slug: true, shotAt: true, bookingId: true, processingUploads: true, processingStartedAt: true, processingError: true, _count: { select: { items: true } }, mediaFolder: { select: { id: true, name: true } } } });
  if (!gallery) throw new GalleryInputError("This private client gallery is unavailable or outside your access scope.");
  return { gallery, where, client };
}

function refresh(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`, "layout");
  revalidatePath("/admin/modules/media");
  revalidatePath("/admin/modules/portfolio");
}

export async function getClientGalleryWorkspace(clientId: string): Promise<ClientGalleryWorkspace> {
  const ctx = await context();
  const client = await accessibleClient(ctx, clientId);
  const [galleries, orderItems, bookings, sentEmails] = await Promise.all([
    prisma.portfolioGallery.findMany({
      where: await getAccessibleGalleryWhere(ctx.user, ctx.siteId, { clientId, visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED }),
      include: {
        _count: { select: { items: true } },
        purchase: { include: { order: { include: { payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } } } },
        packageProduct: { select: { name: true } },
        extraPhotoAddOn: { include: { commerceProduct: true } },
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
    }),
    prisma.booking.findMany({
      where: await getAccessibleBookingWhere(ctx.user, ctx.siteId, { clientId, status: { notIn: ["CANCELED"] } }),
      select: { id: true, sessionName: true, packageSnapshot: true, startsAt: true, service: { select: { name: true } } },
      orderBy: { startsAt: "desc" }
    }),
    prisma.emailOutbox.findMany({
      where: { siteId: ctx.siteId, relatedType: "client", relatedId: clientId, templateKey: "portfolio.session.ready", status: "SENT", idempotencyKey: { startsWith: "gallery-ready:" } },
      select: { idempotencyKey: true }
    })
  ]);
  const canManageMedia = hasAdminPermission(ctx.user, "media:manage") && ctx.settings.enabledModuleIds.includes("media");
  const seen = new Set<string>();
  return {
    clientName: client.name,
    clientEmail: client.email,
    canSendEmail: ctx.settings.enabledModuleIds.includes("communications") && z.email().safeParse(client.email).success,
    today: getZonedDateKey(new Date(), ctx.settings.timezone),
    sessions: bookings.map(booking => ({ id: booking.id, name: booking.sessionName || booking.service.name, date: getZonedDateKey(booking.startsAt, ctx.settings.timezone), includedPhotos: sessionPackageSnapshotSchema.safeParse(booking.packageSnapshot).data?.deliverables?.finalPhotos })),
    galleries: galleries.map((gallery) => {
      const purchase = gallery.purchase;
      const selectionComplete = Boolean(purchase && purchase.selectedCount > 0 && !purchase.revokedAt &&
        purchase.siteId === ctx.siteId && purchase.clientId === clientId &&
        (!purchase.order || purchase.order.siteId === ctx.siteId && purchase.order.clientId === clientId) &&
        purchaseReleaseStatus(purchase) === "RELEASED");
      return {
        id: gallery.id, bookingId: gallery.bookingId, title: gallery.title, description: gallery.description, sessionDate: gallery.shotAt?.toISOString().slice(0, 10) || "", photoCount: gallery._count.items, packageName: gallery.packageProduct?.name || "Session photos",
        imageStatus: clientGalleryImageStatus({ ...gallery, photoCount: gallery._count.items }),
        selectionComplete,
        photosSent: sentEmails.some(email => email.idempotencyKey.startsWith(`gallery-ready:${gallery.id}:`)),
        extraPhotoAddOnId: gallery.extraPhotoAddOnId, extraPhotoAddOnName: gallery.extraPhotoAddOn?.name || null, extraPhotoAddOn: gallery.extraPhotoAddOn ? serviceLibraryItemSchema.parse(gallery.extraPhotoAddOn) : null,
        selectionAllowance: gallery.selectionAllowance, extraPhotoPriceCents: gallery.extraPhotoAddOn?.priceCents ?? gallery.extraPhotoPriceCents, selectionCurrency: gallery.extraPhotoAddOn?.commerceProduct?.currency || gallery.selectionCurrency,
        accessPath: gallery.accesses[0] ? `/proofs/${encodeURIComponent(gallery.accesses[0].accessToken)}` : null
      };
    }),
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

async function sessionMediaFolder(tx: Prisma.TransactionClient, ctx: Awaited<ReturnType<typeof context>>, clientId: string, title: string, date: string, sessionId: string) {
  // Serialize sessions for the same client so repeat visits reuse the same folder.
  const client = await tx.client.update({ where: { id: clientId, siteId: ctx.siteId }, data: { updatedAt: new Date() }, include: { mediaFolder: true } });
  let parent = client.mediaFolder;
  if (!parent) {
    await tx.mediaFolder.upsert({ where: { siteId_name: { siteId: ctx.siteId, name: "Clients" } }, create: { siteId: ctx.siteId, name: "Clients", createdByUserId: ctx.user.id }, update: {} });
    let name = `Clients/${mediaFolderSegment(client.name)}`;
    if (await tx.mediaFolder.findUnique({ where: { siteId_name: { siteId: ctx.siteId, name } } })) name += ` (${client.id})`;
    parent = await tx.mediaFolder.create({ data: { siteId: ctx.siteId, name, createdByUserId: ctx.user.id } });
    await tx.client.update({ where: { id: client.id }, data: { mediaFolderId: parent.id } });
  }
  let name = `${parent.name}/${clientSessionFolderName(title, date)}`;
  if (await tx.mediaFolder.findUnique({ where: { siteId_name: { siteId: ctx.siteId, name } } })) name += ` (${sessionId.slice(0, 8)})`;
  if (name.length > 200) throw new GalleryInputError("The client folder path is too long. Shorten its name in Media before adding a session.");
  return tx.mediaFolder.create({ data: { siteId: ctx.siteId, name, createdByUserId: ctx.user.id } });
}

export async function createClientGalleryAction(raw: unknown): Promise<ClientGalleryResult<{ galleryId: string }>> {
  const ctx = await context();
  try {
    const input = clientGalleryCreateSchema.parse(raw);
    const client = await accessibleClient(ctx, input.clientId);
    if (!z.email().safeParse(client.email).success) throw new GalleryInputError("Add a valid client email before creating a private access link.");
    const packageInput = "packageProductId" in input ? input : null;
    if (input.bookingId) {
      const booking = await prisma.booking.findFirst({ where: await getAccessibleBookingWhere(ctx.user, ctx.siteId, {
        id: input.bookingId, clientId: client.id, status: { notIn: ["CANCELED"] }
      }), select: { id: true } });
      if (!booking) throw new GalleryInputError("Choose a scheduled session belonging to this client.");
    }
    const purchasedPackage = packageInput ? await prisma.orderItem.findFirst({
      where: {
        productId: packageInput.packageProductId, orderId: packageInput.purchasedOrderId,
        order: { siteId: ctx.siteId, clientId: client.id, status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] }, gallerySelectionPurchase: { is: null } },
        product: { siteId: ctx.siteId, type: ProductType.SERVICE_PACKAGE }
      }, select: { id: true }
    }) : null;
    if (packageInput && !purchasedPackage) throw new GalleryInputError("Choose a service package from a paid or fulfilled order belonging to this client.");
    const ownerIds = await getOwnerStaffIds(ctx.user, ctx.siteId);
    if ((await resolveDataScopeMode(ctx.user, ctx.siteId, "portfolio")) === "OWN" && !ownerIds.length) {
      throw new GalleryInputError("Link your admin account to an active staff profile before creating a gallery.");
    }
    const sessionDate = input.sessionDate || getZonedDateKey(new Date(), ctx.settings.timezone);
    const requestWhere = await getAccessibleGalleryWhere(ctx.user, ctx.siteId, {
      id: input.requestId, clientId: client.id, title: input.title, description: input.description,
      bookingId: input.bookingId || null, shotAt: new Date(`${sessionDate}T00:00:00Z`), packageProductId: packageInput?.packageProductId ?? null,
      purchasedOrderId: packageInput?.purchasedOrderId ?? null, selectionAllowance: packageInput?.selectionAllowance ?? null,
      extraPhotoPriceCents: packageInput?.extraPhotoPrice ?? null, selectionCurrency: packageInput?.selectionCurrency ?? null,
      visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED
    });
    const previous = await prisma.portfolioGallery.findFirst({ where: requestWhere });
    if (previous) return { ok: true, data: { galleryId: previous.id } };
    assertAdminCan(ctx.user, "media:manage");
    const gallery = await prisma.$transaction(async tx => {
      const folder = await sessionMediaFolder(tx, ctx, client.id, input.title, sessionDate, input.requestId);
      return tx.portfolioGallery.create({
      data: {
        id: input.requestId, siteId: ctx.siteId, clientId: client.id, bookingId: input.bookingId,
        description: input.description, shotAt: new Date(`${sessionDate}T00:00:00Z`), mediaFolderId: folder.id, photographerId: ownerIds[0], title: input.title,
        slug: `${slugify(input.title).slice(0, 80) || "shoot"}-${randomUUID()}`,
        packageProductId: packageInput?.packageProductId ?? null, purchasedOrderId: packageInput?.purchasedOrderId ?? null,
        selectionAllowance: packageInput?.selectionAllowance ?? null, extraPhotoPriceCents: packageInput?.extraPhotoPrice ?? null, selectionCurrency: packageInput?.selectionCurrency ?? null,
        visibility: PortfolioGalleryVisibility.PRIVATE, status: PortfolioGalleryStatus.PUBLISHED,
        proofingEnabled: Boolean(packageInput), downloadEnabled: true, publishedAt: new Date(),
        proofRounds: { create: { siteId: ctx.siteId, roundNumber: 1, title: "Client selection" } },
        accesses: { create: { siteId: ctx.siteId, clientId: client.id, recipientEmail: client.email.trim().toLowerCase(), accessToken: randomUUID() } }
      }, select: { id: true }
      });
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
      ...(input.mode === "gallery" ? { id: { in: existingIds } } : input.folder || !input.query ? { folder: input.folder } : {}),
      ...(input.query ? { OR: [
        { filename: { contains: input.query, mode: "insensitive" as const } },
        { alt: { contains: input.query, mode: "insensitive" as const } },
        { caption: { contains: input.query, mode: "insensitive" as const } },
        { folder: { contains: input.query, mode: "insensitive" as const } },
        { tags: { array_contains: [input.query.toLowerCase()] } }
      ] } : {})
    });
    const folderGroups = input.mode === "library" ? await prisma.mediaAsset.groupBy({ by: ["folder"], where: await getAccessibleMediaWhere(ctx.user, ctx.siteId, {
      deletedAt: null, isPrivate: true, mimeType: { in: [...clientGalleryImageTypes] }, driver: { in: ["SERVER_ASSETS", "S3", "R2"] }
    }) }) : [];
    const ownFolders = input.mode === "library" && (await resolveDataScopeMode(ctx.user, ctx.siteId, "media")) === "OWN";
    const savedFolders = input.mode === "library" ? await prisma.mediaFolder.findMany({ where: { siteId: ctx.siteId, ...(ownFolders ? { createdByUserId: ctx.user.id } : {}) }, select: { name: true } }) : [];
    const total = await prisma.mediaAsset.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / clientGalleryPageSize));
    const page = Math.min(input.page, pageCount);
    const assets = await prisma.mediaAsset.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * clientGalleryPageSize, take: clientGalleryPageSize
    });
    const included = new Set(existingIds);
    return { ok: true, data: {
      folders: [...new Set([...savedFolders.map(row => row.name), ...folderGroups.map(row => row.folder).filter(Boolean)])],
      assets: assets.map((asset) => ({
        id: asset.id, filename: asset.filename, alt: asset.alt || asset.filename, folder: asset.folder,
        thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.THUMBNAIL), previewUrl: mediaAssetDisplayUrl(asset, MediaVariantType.FULL), downloadUrl: `${mediaAssetDisplayUrl(asset, MediaVariantType.DOWNLOAD)}&download=1`, alreadyAdded: included.has(asset.id)
      })), page, pageCount, total
    } };
  } catch (error) { return failure(error); }
}

async function withImageProcessing<T>(ctx: Awaited<ReturnType<typeof context>>, clientId: string, galleryId: string, work: () => Promise<T>) {
  const { where } = await accessibleGallery(ctx, clientId, galleryId);
  // A crashed request becomes actionable instead of leaving a session processing forever.
  await prisma.portfolioGallery.updateMany({ where: { AND: [where, { processingStartedAt: { lt: new Date(Date.now() - clientPhotoProcessingTimeoutMs) } }] }, data: { processingUploads: 0 } });
  const started = await prisma.portfolioGallery.updateMany({ where, data: { processingUploads: { increment: 1 }, processingStartedAt: new Date(), processingError: "" } });
  if (!started.count) throw new GalleryInputError("This session is no longer available.");
  try { return await work(); }
  catch (error) {
    await prisma.portfolioGallery.updateMany({ where, data: { processingError: "Some images could not be processed. Check the upload results and try again." } });
    throw error;
  } finally {
    await prisma.portfolioGallery.updateMany({ where: { AND: [where, { processingUploads: { gt: 0 } }] }, data: { processingUploads: { decrement: 1 } } });
    refresh(clientId);
  }
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
  for (const asset of assets) {
    for (const variant of [MediaVariantType.THUMBNAIL, MediaVariantType.FULL]) {
      if (!(await galleryProofResponse(asset, variant))?.ok) throw new GalleryInputError("Client preview generation failed. Your original remains in Media; try adding it again.");
    }
  }
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
    const added = await withImageProcessing(ctx, input.clientId, input.galleryId, () => addAssets(ctx, input.clientId, input.galleryId, input.assetIds));
    refresh(input.clientId);
    return { ok: true, data: { added } };
  } catch (error) { return failure(error); }
}

export async function uploadClientGalleryPhotoAction(formData: FormData): Promise<ClientGalleryResult<{ assetId: string; added: number }>> {
  const ctx = await context();
  assertAdminCan(ctx.user, "media:manage");
  try {
    const input = clientGalleryTargetSchema.parse({ clientId: formData.get("clientId"), galleryId: formData.get("galleryId") });
    const { gallery, client } = await accessibleGallery(ctx, input.clientId, input.galleryId);
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
    const folder = gallery.mediaFolder || await prisma.$transaction(async tx => {
      const current = await tx.portfolioGallery.update({ where: { id: gallery.id }, data: { updatedAt: new Date() }, include: { mediaFolder: true } });
      if (current.mediaFolder) return current.mediaFolder;
      const folder = await sessionMediaFolder(tx, ctx, input.clientId, gallery.title, gallery.shotAt?.toISOString().slice(0, 10) || getZonedDateKey(new Date(), ctx.settings.timezone), gallery.id);
      await tx.portfolioGallery.update({ where: { id: gallery.id }, data: { mediaFolderId: folder.id } });
      return folder;
    });
    return await withImageProcessing(ctx, input.clientId, gallery.id, async () => {
    const filename = clientSessionPhotoFilename(client.name, gallery.shotAt?.toISOString().slice(0, 10) || getZonedDateKey(new Date(), ctx.settings.timezone), file.name, randomUUID());
    const namedFile = new File([file], filename, { type: file.type, lastModified: file.lastModified });
    const asset = await uploadMedia(namedFile, {
      isPrivate: true, alt: file.name.replace(/\.[^.]+$/, ""), folder: folder.name,
      usageContext: `Client shoot: ${gallery.title}`, uploadedByStaffId: ownerIds[0]
    }, ctx.settings.mediaDriver, ctx.siteId, { allowedMimeTypes: clientGalleryImageTypes, maxBytes: clientGalleryUploadMaxBytes, maxPixels: clientGalleryUploadMaxPixels, requireImage: true });
    try {
      const added = await addAssets(ctx, input.clientId, gallery.id, [asset.id]);
      refresh(input.clientId);
      return { ok: true as const, data: { assetId: asset.id, added } };
    } catch {
      await prisma.portfolioGallery.updateMany({ where: { id: gallery.id, siteId: ctx.siteId }, data: { processingError: "Some images could not be added. Retry from Media." } });
      refresh(input.clientId);
      return { ok: false as const, error: `${file.name} was saved privately to Media, but could not be added to this gallery. Choose it from Media to retry without uploading again.` };
    }
    });
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

export async function sendClientGalleryEmailAction(raw: unknown): Promise<ClientGalleryResult<{ recipientEmail: string }>> {
  const ctx = await context();
  try {
    const input = clientGalleryTargetSchema.extend({ requestId: z.uuid() }).parse(raw);
    if (!ctx.settings.enabledModuleIds.includes("communications")) throw new GalleryInputError("Enable Communications before sending session emails.");
    const client = await accessibleClient(ctx, input.clientId);
    if (!z.email().safeParse(client.email).success) throw new GalleryInputError("Add a valid client email before sending photos.");
    const { gallery } = await accessibleGallery(ctx, input.clientId, input.galleryId);
    if (clientGalleryImageStatus({ ...gallery, photoCount: gallery._count.items }) !== "Ready") throw new GalleryInputError("Wait until all session images are ready before sending photos.");
    if (gallery.bookingId && !await prisma.booking.findFirst({ where: await getAccessibleBookingWhere(ctx.user, ctx.siteId, { id: gallery.bookingId, clientId: client.id, status: { notIn: ["CANCELED"] } }), select: { id: true } })) throw new GalleryInputError("This session is unavailable or canceled.");
    const link = await createClientGalleryLinkAction(input);
    if (!link.ok) return link;
    const templateKey = "portfolio.session.ready";
    const body = "Hi {{customerName}},\n\nYour photos from {{sessionName}} are ready.\n\nView your private gallery: {{galleryUrl}}\n\nPlease keep this link private.\n\n{{businessName}}";
    await prisma.messageTemplate.upsert({
      where: { siteId_key: { siteId: ctx.siteId, key: templateKey } }, update: {},
      create: { siteId: ctx.siteId, key: templateKey, name: "Session photos ready", purpose: "GALLERY_ACCESS", channel: "EMAIL", subject: "Your {{sessionName}} photos are ready", body, textBody: body, htmlBody: '<p>Hi {{customerName}},</p><p>Your photos from {{sessionName}} are ready.</p><p><a href="{{galleryUrl}}">View your private gallery</a></p><p>Please keep this link private.</p><p>{{businessName}}</p>',
        requiredTokens: ["customerName", "sessionName", "galleryUrl", "businessName"] }
    });
    const idempotencyKey = `gallery-ready:${gallery.id}:${input.requestId}`;
    await queueEmail({ siteId: ctx.siteId, templateKey, category: EmailCategory.TRANSACTIONAL, recipientEmail: client.email, recipientName: client.name,
      relatedType: "client", relatedId: client.id, idempotencyKey,
      tokens: { customerName: client.name, sessionName: gallery.title, galleryUrl: new URL(link.data.accessPath, publicAppBaseUrl()).toString(), businessName: ctx.settings.businessName } });
    const queued = await prisma.emailOutbox.findFirst({ where: { siteId: ctx.siteId, idempotencyKey }, select: { status: true } });
    if (!queued || !["QUEUED", "SENDING", "SENT"].includes(queued.status)) throw new GalleryInputError(queued?.status === "SUPPRESSED" ? "Email is blocked for this client. Check Communications before retrying." : "The email could not be queued. Check Communications for details, then try again.");
    refresh(client.id);
    return { ok: true, data: { recipientEmail: client.email } };
  } catch (error) { return failure(error); }
}

export async function configureClientGalleryProofingAction(raw: unknown): Promise<ClientGalleryResult<{ galleryId: string }>> {
  const ctx = await context();
  try {
    const input = clientGalleryTargetSchema.extend({ includedCount: z.number().int().min(0).max(10000), addOnId: z.string().trim().min(1).max(100), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/) }).parse(raw);
    const { gallery, where } = await accessibleGallery(ctx, input.clientId, input.galleryId);
    const booking = gallery.bookingId && await prisma.booking.findFirst({ where: await getAccessibleBookingWhere(ctx.user, ctx.siteId, { id: gallery.bookingId, clientId: input.clientId, status: { notIn: ["CANCELED"] } }), select: { id: true } });
    if (!booking) throw new GalleryInputError("Choose an active session for this client before enabling photo selection.");
    await prisma.$transaction(async tx => {
      const locked = await tx.portfolioGallery.updateMany({ where, data: { updatedAt: new Date() } });
      if (!locked.count) throw new GalleryInputError("This gallery is no longer available.");
      const current = await tx.portfolioGallery.findFirst({ where, select: { purchasedOrderId: true, packageProductId: true, purchase: { select: { id: true } } } });
      if (!current || current.purchase || current.purchasedOrderId || current.packageProductId) throw new GalleryInputError("Finalized or purchased package terms cannot be replaced here.");
      await tx.serviceLibraryItem.updateMany({ where: { id: input.addOnId, siteId: ctx.siteId }, data: { updatedAt: new Date() } });
      const addon = await tx.serviceLibraryItem.findFirst({ where: { id: input.addOnId, siteId: ctx.siteId, pricingType: "PER_UNIT", priceCents: { not: null } }, include: { commerceProduct: true } });
      if (!addon || addon.priceCents === null) throw new GalleryInputError("Choose a per-unit add-on with a saved price from this business.");
      const increases = sessionDeliverablesSchema.safeParse(addon.deliverables);
      if (!increases.success || increases.data.finalPhotos !== 1 || (increases.data.locations || 0) || (increases.data.outfitChanges || 0)) throw new GalleryInputError("For proof extras, choose a per-unit add-on that adds one photo and no locations or outfit changes.");
      if (!supportsPhotoCurrency(input.currency)) throw new GalleryInputError("Use a supported two-decimal currency, such as USD, EUR, or GBP.");
      if (addon.commerceProduct && (addon.commerceProduct.siteId !== ctx.siteId || addon.commerceProduct.type !== "DIGITAL")) throw new GalleryInputError("This add-on is outside your business.");
      const product = await tx.product.upsert({ where: { id: addon.commerceProductId || randomUUID() },
        create: { siteId: ctx.siteId, name: addon.name, type: "DIGITAL", status: "DRAFT", basePriceCents: addon.priceCents, currency: input.currency, requiresShipping: false },
        update: { name: addon.name, basePriceCents: addon.priceCents, currency: input.currency } });
      if (!addon.commerceProductId) await tx.serviceLibraryItem.update({ where: { id: addon.id }, data: { commerceProductId: product.id } });
      await tx.portfolioGallery.update({ where: { id: gallery.id }, data: { extraPhotoAddOnId: addon.id, selectionAllowance: input.includedCount, extraPhotoPriceCents: addon.priceCents, selectionCurrency: input.currency, proofingEnabled: true } });
    });
    refresh(input.clientId);
    return { ok: true, data: { galleryId: gallery.id } };
  } catch (error) { return failure(error); }
}
