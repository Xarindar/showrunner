import type { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";

type CommerceSlugModel = "product" | "collection";

async function slugExists(prisma: PrismaClient, model: CommerceSlugModel, slug: string, exceptId?: string) {
  if (model === "product") {
    const item = await prisma.product.findUnique({
      where: { slug },
      select: { id: true }
    });

    return Boolean(item && item.id !== exceptId);
  }

  const item = await prisma.collection.findUnique({
    where: { slug },
    select: { id: true }
  });

  return Boolean(item && item.id !== exceptId);
}

export async function generateUniqueCommerceSlug(
  prisma: PrismaClient,
  model: CommerceSlugModel,
  input: { name: string; slug?: string; exceptId?: string }
) {
  const base = slugify(input.slug || input.name) || model;
  let candidate = base;
  let suffix = 2;

  while (await slugExists(prisma, model, candidate, input.exceptId)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
