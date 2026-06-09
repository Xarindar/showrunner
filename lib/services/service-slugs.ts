import type { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";

type ServiceSlugPrisma = Pick<PrismaClient, "service">;

export async function generateUniqueServiceSlug(
  prisma: ServiceSlugPrisma,
  input: { name: string; slug?: string | null; siteId?: string }
) {
  const siteId = input.siteId || DEFAULT_SITE_ID;
  const baseSlug = slugify(input.slug || input.name) || "service";
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.service.findFirst({ where: { siteId, slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
