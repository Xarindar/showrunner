import "server-only";
import { MediaVariantType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mediaAssetDisplayUrl } from "@/lib/media";
import type { CatalogCard } from "./showcase";

export async function showcaseCatalog(siteId: string, modules: readonly string[], db: Pick<Prisma.TransactionClient, "service" | "product"> = prisma): Promise<CatalogCard[]> {
  const [services, products] = await Promise.all([
    modules.includes("scheduling") ? db.service.findMany({ where: { siteId, isActive: true }, include: { mediaAsset: true }, orderBy: { name: "asc" } }) : [],
    modules.includes("products") ? db.product.findMany({ where: { siteId, status: "ACTIVE" }, include: { media: { where: { role: "PRIMARY" }, include: { mediaAsset: true }, orderBy: { sortOrder: "asc" }, take: 1 } }, orderBy: { name: "asc" } }) : [],
  ]);
  return [
    ...services.map(item => ({ key: `service:${item.id}`, id: item.id, kind: "service" as const, slug: item.slug, name: item.name, description: item.description || "", imageUrl: item.mediaAsset ? (!item.mediaAsset.isPrivate && !item.mediaAsset.deletedAt && item.mediaAsset.siteId === siteId ? mediaAssetDisplayUrl(item.mediaAsset, MediaVariantType.CARD) : "") : item.imageUrl, priceCents: null, currency: "", durationMinutes: item.durationMinutes, available: true, category: item.category })),
    ...products.map(item => ({ key: `product:${item.id}`, id: item.id, kind: "product" as const, slug: item.slug, name: item.name, description: item.summary || item.description, imageUrl: item.media[0]?.mediaAsset ? (!item.media[0].mediaAsset.isPrivate && !item.media[0].mediaAsset.deletedAt && item.media[0].mediaAsset.siteId === siteId ? mediaAssetDisplayUrl(item.media[0].mediaAsset, MediaVariantType.CARD) : "") : item.media[0]?.url || item.imageUrl, priceCents: item.basePriceCents, currency: item.currency, durationMinutes: null, available: !item.trackInventory || (item.inventoryQuantity || 0) > 0, category: "" })),
  ];
}
