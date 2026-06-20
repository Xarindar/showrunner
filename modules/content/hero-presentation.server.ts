import { prisma } from "@/lib/prisma";
import type { SiteSettingsWithModules } from "@/lib/site";
import { normalizeHeroPresentation } from "./hero-presentation";

export async function getHeroPresentationForSite(siteId: string, settings: SiteSettingsWithModules) {
  const presentation = await prisma.heroPresentation.findUnique({
    where: { siteId },
    include: {
      slides: {
        include: { elements: true },
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  return normalizeHeroPresentation(presentation, settings);
}
