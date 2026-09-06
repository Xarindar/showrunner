import "server-only";
import { resolveContentManifest } from "@/clients/content-manifests";
import { getPublicContentProfilePayload } from "@/clients/cottage616/content-profiles";
import { readStudio } from "@/modules/content/studio/state";
import type { SiteSettingsWithModules } from "@/lib/site";
import { configuredBlock, type ContentBlockConfig } from "@/modules/content/studio/manifest";

// Deployment adapters supply existing content; the shared editor only consumes manifests.
export async function getEditorManifest(settings: SiteSettingsWithModules) {
  const manifest = resolveContentManifest(settings.siteId, settings.publicContentConfig);
  if (manifest.id !== "cottage616") return manifest;
  const profiles = await Promise.all(["cottage616", "the-hive"].map(key => getPublicContentProfilePayload(settings.siteId, key)));
  const dynamic: ContentBlockConfig[] = profiles.flatMap((profile, pageIndex) => {
    const page = pageIndex ? "hive" : "home";
    const allScreens = profile.hero.slideshow?.screens || [profile.hero.hero];
    const configuredScreens = allScreens.filter(screen => screen.backgrounds.some(bg => bg.url && !/\/hero\.svg([?#]|$)/i.test(bg.url)));
    const staticHero = configuredScreens.length === 0;
    const screens = staticHero ? allScreens.slice(0, 1) : configuredScreens;
    const legacy = readStudio(settings.publicContentConfig).blocks[`${page}-hero`]?.payload;
    const oldTexts = legacy?.texts as { text: string }[] | undefined;
    const oldImages = legacy?.images as { url: string; alt: string }[] | undefined;
    const oldLinks = legacy?.links as { label: string; href: string }[] | undefined;
    let textIndex = 0, linkIndex = 0;
    const slides = screens.map((screen, index) => {
      let title = "", caption = "", buttonLabel = "", buttonHref = "";
      screen.canvasLayers.forEach(layer => {
        if (layer.type === "text") {
          const text = oldTexts?.[textIndex++]?.text ?? layer.content;
          if (layer.role === "headline") title = text;
          else caption = [caption, text].filter(Boolean).join("\n");
        } else {
          const link = oldLinks?.[linkIndex++];
          buttonLabel = link?.label ?? layer.content;
          buttonHref = link?.href ?? layer.link;
        }
      });
      const bg = screen.backgrounds[0];
      const fallback = pageIndex ? "assets/hive/photos/treatments/head-spa-1280w.webp" : "assets/cottage-616/photos/venue/neon-sign-1280w.webp";
      return { id: `slide-${index + 1}`, imageUrl: oldImages?.[index]?.url ?? (staticHero ? new URL(fallback, manifest.previewUrl).toString() : bg?.url || ""), imageAlt: oldImages?.[index]?.alt ?? bg?.altText ?? "", title, caption, buttonLabel, buttonHref };
    });
    return [
      configuredBlock(`${page}-hero`, "slideshow", [page], { label: "Header carousel", defaults: { slides }, minimums: { slides: 1 }, presentation: { selector: ".hero" } }),
      configuredBlock(`${page}-reviews`, "testimonials", [page], { label: "Guest reviews", defaults: { heading: profile.testimonials.heading, copy: profile.testimonials.intro, items: profile.testimonials.items.map(item => ({ id: item.id, author: item.authorName, quote: item.quote, role: item.authorRole || "" })) }, presentation: { selector: "[data-showrunner-testimonials]" } }),
    ];
  });
  const selectors: Record<string, string> = { "home-events": "#events", "home-venue-gallery": ".venue-strip", "vendors-directory": ".vendors-directory", "business-info": ".site-footer address" };
  return { ...manifest, previewUrl: process.env.CONTENT_PREVIEW_URL || manifest.previewUrl, blocks: [...dynamic, ...manifest.blocks.map(block => ({ ...block,
    ...(block.type === "business" ? { defaults: { phone: "(870) 219-6982", line1: "3773 County Road 616", city: "Bay", region: "AR", postalCode: "72411" } } : {}),
    ...(selectors[block.id] ? { presentation: { ...block.presentation, selector: selectors[block.id] } } : {})
  }))] };
}
