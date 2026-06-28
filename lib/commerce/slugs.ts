import type { PrismaClient } from "@prisma/client";
import { getCurrentSiteId } from "@/lib/site";
import { slugify } from "@/lib/slug";

type CommerceSlugModel = "product" | "collection" | "category";

async function slugExists(prisma: PrismaClient, model: CommerceSlugModel, slug: string, siteId: string, exceptId?: string) {
  if (model === "product") {
    const item = await prisma.product.findFirst({
      where: { siteId, slug },
      select: { id: true }
    });

    return Boolean(item && item.id !== exceptId);
  }

  const item =
    model === "collection"
      ? await prisma.collection.findFirst({
          where: { siteId, slug },
          select: { id: true }
        })
      : await prisma.productCategory.findFirst({
          where: { siteId, slug },
          select: { id: true }
        });

  return Boolean(item && item.id !== exceptId);
}

export async function generateUniqueCommerceSlug(
  prisma: PrismaClient,
  model: CommerceSlugModel,
  input: { name: string; slug?: string; siteId?: string; exceptId?: string }
) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const base = slugify(input.slug || input.name) || model;
  let candidate = base;
  let suffix = 2;

  while (await slugExists(prisma, model, candidate, siteId, input.exceptId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
