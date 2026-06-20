"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { HeroPresentationMode, HeroSlideElementType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite, resolveCurrentSite } from "@/lib/site";
import { defaultEnabledModules } from "@/shell/modules";
import {
  defaultHeroSlideFromSettings,
  heroElementsArray,
  parseHeroPresentationPayload,
  type HeroElementType
} from "./hero-presentation";

const heroElementTypeMap: Record<HeroElementType, HeroSlideElementType> = {
  IMAGE: HeroSlideElementType.IMAGE,
  HEADLINE: HeroSlideElementType.HEADLINE,
  CAPTION: HeroSlideElementType.CAPTION,
  CTA: HeroSlideElementType.CTA
};

export async function updateContentAction(formData: FormData) {
  await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const currentSettings = await getSiteSettingsForSite(site.id);
  const fallbackPresentation = {
    mode: "STATIC" as const,
    autoplayIntervalMs: 6500,
    slides: [defaultHeroSlideFromSettings(currentSettings)]
  };
  const heroPresentation = parseHeroPresentationPayload(formData.get("heroPresentation"), fallbackPresentation);
  const primarySlide = heroPresentation.slides[0] || fallbackPresentation.slides[0];

  await prisma.$transaction(async (tx) => {
    await tx.siteSettings.upsert({
      where: { siteId: site.id },
      update: {
        heroImageUrl: primarySlide.imageUrl,
        heroHeadline: primarySlide.headline,
        heroSubheadline: primarySlide.caption,
        introTitle: String(formData.get("introTitle") || ""),
        introBody: String(formData.get("introBody") || "")
      },
      create: {
        siteId: site.id,
        enabledModules: defaultEnabledModules,
        heroImageUrl: primarySlide.imageUrl,
        heroHeadline: primarySlide.headline,
        heroSubheadline: primarySlide.caption,
        introTitle: String(formData.get("introTitle") || ""),
        introBody: String(formData.get("introBody") || "")
      }
    });

    const presentation = await tx.heroPresentation.upsert({
      where: { siteId: site.id },
      update: {
        mode: heroPresentation.mode === "SLIDESHOW" ? HeroPresentationMode.SLIDESHOW : HeroPresentationMode.STATIC,
        autoplayIntervalMs: heroPresentation.autoplayIntervalMs
      },
      create: {
        siteId: site.id,
        mode: heroPresentation.mode === "SLIDESHOW" ? HeroPresentationMode.SLIDESHOW : HeroPresentationMode.STATIC,
        autoplayIntervalMs: heroPresentation.autoplayIntervalMs
      }
    });

    await tx.heroSlide.deleteMany({
      where: { presentationId: presentation.id }
    });

    for (const [index, slide] of heroPresentation.slides.entries()) {
      await tx.heroSlide.create({
        data: {
          presentationId: presentation.id,
          sortOrder: index,
          headline: slide.headline,
          caption: slide.caption,
          imageUrl: slide.imageUrl,
          ctaLabel: slide.ctaLabel,
          ctaHref: slide.ctaHref,
          elements: {
            create: heroElementsArray(slide.elements).map((element) => ({
              type: heroElementTypeMap[element.type],
              gridColumn: element.gridColumn,
              gridRow: element.gridRow,
              columnSpan: element.columnSpan,
              rowSpan: element.rowSpan,
              zIndex: element.zIndex,
              isVisible: element.isVisible
            }))
          }
        }
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/admin/modules/content");
  revalidatePath("/sitemap.xml");
  redirect("/admin/modules/content?saved=1");
}
