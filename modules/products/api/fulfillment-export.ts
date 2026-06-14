import { NextResponse } from "next/server";
import { OrderStatus, ProductType } from "@prisma/client";
import { csvDocument } from "@/lib/api/csv";
import { recordAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

const nestedAttributeGroups = ["printLab", "lab", "source", "gallery", "portfolio"];

function stringAttribute(attributes: unknown, keys: string[]) {
  const root = isRecord(attributes) ? attributes : {};

  for (const key of keys) {
    const value = root[key];
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
  }

  for (const groupKey of nestedAttributeGroups) {
    const group = root[groupKey];
    if (!isRecord(group)) continue;

    for (const key of keys) {
      const value = group[key];
      if (typeof value === "string") return value.trim();
      if (typeof value === "number") return String(value);
    }
  }

  return "";
}

function fulfillmentSourceMetadata(attributes: unknown) {
  return {
    galleryId: stringAttribute(attributes, ["galleryId", "portfolioGalleryId", "sourceGalleryId"]),
    galleryItemId: stringAttribute(attributes, ["galleryItemId", "portfolioGalleryItemId", "sourceGalleryItemId"]),
    mediaAssetId: stringAttribute(attributes, ["mediaAssetId", "sourceMediaAssetId"]),
    printCrop: stringAttribute(attributes, ["printCrop", "crop", "aspectRatio"]),
    printFinish: stringAttribute(attributes, ["printFinish", "paper", "paperType", "finish"]),
    printLabSku: stringAttribute(attributes, ["printLabSku", "labSku", "labProductCode"]),
    printNotes: stringAttribute(attributes, ["printNotes", "labNotes"]),
    printSize: stringAttribute(attributes, ["printSize", "size"])
  };
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

export async function GET(request: Request) {
  const user = await requireAdmin("products:manage");
  const settings = await getSiteSettings();
  // Opt-in "since last export" scoping: ?unexportedOnly=1 emits only orders that
  // haven't been marked exported yet, so a lab can pull deltas without
  // re-receiving already-handed-off orders. Default stays the full snapshot.
  const unexportedOnly = new URL(request.url).searchParams.get("unexportedOnly") === "1";
  const orders = await prisma.order.findMany({
    where: {
      siteId: settings.siteId,
      status: OrderStatus.PAID,
      ...(unexportedOnly ? { fulfillmentExportedAt: null } : {}),
      items: {
        some: {
          product: { type: ProductType.PHYSICAL }
        }
      }
    },
    include: {
      items: {
        where: {
          product: { type: ProductType.PHYSICAL }
        },
        include: {
          product: true,
          variant: true
        },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: [{ placedAt: "asc" }, { createdAt: "asc" }]
  });

  const itemSources = orders.flatMap((order) =>
    order.items.map((item) => ({
      source: fulfillmentSourceMetadata(item.product.attributes)
    }))
  );
  const galleryIds = uniq(itemSources.map(({ source }) => source.galleryId));
  const galleryItemIds = uniq(itemSources.map(({ source }) => source.galleryItemId));

  const [galleries, galleryItems] = await Promise.all([
    galleryIds.length
      ? prisma.portfolioGallery.findMany({
          where: { id: { in: galleryIds }, siteId: settings.siteId },
          select: { id: true, slug: true, title: true }
        })
      : [],
    galleryItemIds.length
      ? prisma.portfolioGalleryItem.findMany({
          where: { id: { in: galleryItemIds }, gallery: { siteId: settings.siteId } },
          include: {
            gallery: { select: { id: true, slug: true, title: true } }
          }
        })
      : [],
  ]);
  const mediaAssetIds = uniq([
    ...itemSources.map(({ source }) => source.mediaAssetId),
    ...galleryItems.map((item) => item.mediaAssetId || "")
  ]);
  const mediaAssets = mediaAssetIds.length
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: mediaAssetIds }, siteId: settings.siteId },
        select: { filename: true, id: true, url: true }
      })
    : [];
  const galleryById = new Map(galleries.map((gallery) => [gallery.id, gallery]));
  const galleryItemById = new Map(galleryItems.map((item) => [item.id, item]));
  const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));

  const header = [
    "Order Number",
    "Order Status",
    "Placed At",
    "Customer Name",
    "Customer Email",
    "Client ID",
    "Product",
    "Product SKU",
    "Variant",
    "Variant SKU",
    "Quantity",
    "Unit Price",
    "Line Total",
    "Fulfillment Exported At",
    "Fulfillment Export Batch",
    "Print Lab Name",
    "Print Lab Reference",
    "Print Lab Handoff At",
    "Print Lab SKU",
    "Print Size",
    "Print Finish",
    "Print Crop",
    "Print Notes",
    "Source Gallery ID",
    "Source Gallery Slug",
    "Source Gallery Title",
    "Source Gallery Item ID",
    "Source Gallery Item Title",
    "Source Image URL",
    "Source Media Asset ID",
    "Source Media Filename",
    "Source Media URL"
  ];

  const rows = orders.flatMap((order) =>
    order.items.map((item) => {
      const source = fulfillmentSourceMetadata(item.product.attributes);
      const galleryItem = source.galleryItemId ? galleryItemById.get(source.galleryItemId) : undefined;
      const gallery = galleryItem?.gallery || (source.galleryId ? galleryById.get(source.galleryId) : undefined);
      const mediaAssetId = source.mediaAssetId || galleryItem?.mediaAssetId || "";
      const mediaAsset = mediaAssetId ? mediaById.get(mediaAssetId) : undefined;

      return [
        order.orderNumber,
        order.status,
        isoDate(order.placedAt || order.createdAt),
        order.customerName,
        order.customerEmail,
        order.clientId || "",
        item.name,
        item.sku || item.product.sku || "",
        item.variant?.name || "",
        item.variant?.sku || "",
        item.quantity,
        formatMoney(item.unitPriceCents, order.currency),
        formatMoney(item.lineTotalCents, order.currency),
        isoDate(order.fulfillmentExportedAt),
        order.fulfillmentExportBatch,
        order.printLabName,
        order.printLabReference,
        isoDate(order.printLabHandoffAt),
        source.printLabSku,
        source.printSize,
        source.printFinish,
        source.printCrop,
        source.printNotes,
        gallery?.id || source.galleryId,
        gallery?.slug || "",
        gallery?.title || "",
        galleryItem?.id || source.galleryItemId,
        galleryItem?.title || "",
        galleryItem?.imageUrl || "",
        mediaAsset?.id || mediaAssetId,
        mediaAsset?.filename || "",
        mediaAsset?.url || ""
      ];
    })
  );

  await recordAuditLog({
    action: "order.fulfillment_export_downloaded",
    actor: user,
    metadata: {
      orderCount: orders.length,
      rowCount: rows.length,
      unexportedOnly
    },
    request,
    siteId: settings.siteId,
    targetId: settings.siteId,
    targetLabel: `${rows.length} fulfillment rows exported`,
    targetType: "order_export"
  });

  const csv = csvDocument([header, ...rows], { preventFormulaInjection: true });

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="fulfillment-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
