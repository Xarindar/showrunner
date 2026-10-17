import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionOffering } from "./session-offering";
import { resolveIncludedServices } from "./service-library";

export async function hydrateSessionServiceLibrary(offering: SessionOffering | null, siteId: string) {
  if (!offering?.coverageItems.length) return offering;
  const items = await prisma.serviceLibraryItem.findMany({
    where: { siteId, OR: [
      { id: { in: offering.coverageItems.flatMap(item => item.libraryItemId ? [item.libraryItemId] : []) } },
      { nameKey: { in: offering.coverageItems.filter(item => !item.libraryItemId).map(item => item.name.trim().toLowerCase()) } }
    ] }
  });
  return resolveIncludedServices(offering, items);
}
