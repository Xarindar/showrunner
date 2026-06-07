import type { PrismaClient } from "@prisma/client";
import { slugify } from "@/lib/slug";

type ServiceSlugPrisma = Pick<PrismaClient, "service">;

export async function generateUniqueServiceSlug(prisma: ServiceSlugPrisma, input: { name: string; slug?: string | null }) {
  const baseSlug = slugify(input.slug || input.name) || "service";
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.service.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
