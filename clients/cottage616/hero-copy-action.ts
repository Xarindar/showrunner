"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite, resolveCurrentSite } from "@/lib/site";
import { resolveContentManifest } from "@/clients/content-manifests";
import { isSafeContentUrl } from "@/modules/content/studio/registry";
import { configRecord } from "@/modules/content/studio/state";
import { getHeroPresentationForProfilePayload, normalizeContentProfiles, contentProfileKeys } from "./content-profiles";

const schema = z.strictObject({ profileKey: z.enum(contentProfileKeys), revision: z.string(), slides: z.array(z.strictObject({ id: z.string(), headline: z.string().max(500), caption: z.string().max(10000), imageUrl: z.string().max(2048).refine(isSafeContentUrl), ctaLabel: z.string().max(200), ctaHref: z.string().max(2048).refine(isSafeContentUrl) })).min(1).max(30) });
export async function saveHeroCopy(raw: unknown): Promise<{ revision?: string; error?: string }> {
  await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  try {
    const input = schema.parse(raw);
    const settings = await getSiteSettingsForSite(site.id);
    if (!settings.enabledModuleIds.includes("content") || !resolveContentManifest(site.id, settings.publicContentConfig).legacyProfiles) throw new Error("This editor is not configured for this site");
    if (settings.updatedAt.toISOString() !== input.revision) throw new Error("Site content changed. Reload before saving; keep a copy of your edits.");
    const presentation = await getHeroPresentationForProfilePayload(site.id, input.profileKey, settings);
    if (input.slides.length !== presentation.slides.length || input.slides.some((slide, index) => slide.id !== (presentation.slides[index].id || presentation.slides[index].clientId))) throw new Error("Hero structure is locked");
    const result = await prisma.$transaction(async tx => {
      const profiles = normalizeContentProfiles(settings.publicContentConfig);
      const primary = input.slides[0];
      profiles[input.profileKey].header = { ...profiles[input.profileKey].header, headline: primary.headline, copy: primary.caption, ctaLabel: primary.ctaLabel, ctaHref: primary.ctaHref };
      const updated = await tx.siteSettings.updateMany({ where: { siteId: site.id, updatedAt: settings.updatedAt }, data: {
        publicContentConfig: JSON.parse(JSON.stringify({ ...configRecord(settings.publicContentConfig), profiles })),
        ...(input.profileKey === "cottage616" ? { heroHeadline: primary.headline, heroSubheadline: primary.caption, heroImageUrl: primary.imageUrl } : {}),
      } });
      if (updated.count !== 1) throw new Error("Content changed while saving. Reload before retrying.");
      for (const [index, slide] of input.slides.entries()) {
        const existing = presentation.slides[index];
        if (!existing.id) throw new Error("Hero layout has not been initialized. Configure it before editing content.");
        await tx.heroSlide.updateMany({ where: { id: existing.id, presentation: { siteId: site.id, profileKey: input.profileKey } }, data: { headline: slide.headline, caption: slide.caption, imageUrl: slide.imageUrl, ctaLabel: slide.ctaLabel, ctaHref: slide.ctaHref } });
      }
      return tx.siteSettings.findUniqueOrThrow({ where: { siteId: site.id } });
    });
    revalidatePath("/", "layout");
    return { revision: result.updatedAt.toISOString() };
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not save header" }; }
}
