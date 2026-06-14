import type { PrismaClient } from "@prisma/client";
import { getCurrentSiteId } from "@/lib/site";
import { slugify } from "@/lib/slug";

type ServiceSlugPrisma = Pick<PrismaClient, "service">;

export async function generateUniqueServiceSlug(
  prisma: ServiceSlugPrisma,
  input: { name: string; slug?: string | null; siteId?: string }
) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const baseSlug = slugify(input.slug || input.name) || "service";
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.service.findFirst({ where: { siteId, slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
