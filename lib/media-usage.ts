import type { Prisma } from "@prisma/client";

export const mediaReferenceCountSelect = {
  clientFiles: true,
  productMedia: true,
  serviceCategories: true,
  services: true,
  portfolioItems: true,
  purchasedSelections: true
} satisfies Prisma.MediaAssetCountOutputTypeSelect;

export function mediaReferenceCount(counts: Record<keyof typeof mediaReferenceCountSelect, number>) {
  return Object.keys(mediaReferenceCountSelect).reduce((total, key) => total + counts[key as keyof typeof mediaReferenceCountSelect], 0);
}

// Recheck references in the write, not only in a preflight/UI warning.
export const unreferencedMediaWhere = {
  clientFiles: { none: {} },
  productMedia: { none: {} },
  serviceCategories: { none: {} },
  services: { none: {} },
  portfolioItems: { none: {} },
  purchasedSelections: { none: {} }
} satisfies Prisma.MediaAssetWhereInput;
