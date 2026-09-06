import "server-only";
import { resolveContentManifest } from "@/clients/content-manifests";
import { getPublicContentProfilePayload } from "@/clients/cottage616/content-profiles";
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
    const payload = { texts: [] as { id: string; text: string }[], images: [] as { id: string; url: string; alt: string; caption: string }[], links: [] as { id: string; label: string; href: string }[] };
    const bindings: NonNullable<NonNullable<ContentBlockConfig["presentation"]>["bindings"]> = [];
    screens.forEach((screen, index) => {
      const selector = `.sr-hero-screen:nth-child(${index + 1})`;
      screen.backgrounds.slice(0, 1).forEach(bg => {
        const target = staticHero ? ".hero" : `${selector} .sr-hero-bg`;
        bindings.push({ path: `images.${payload.images.length}.url`, selector: target, attribute: "background" }, { path: `images.${payload.images.length}.alt`, selector: target, attribute: "alt" });
        const fallback = pageIndex ? "assets/hive/photos/treatments/head-spa-1280w.webp" : "assets/cottage-616/photos/venue/neon-sign-1280w.webp";
        payload.images.push({ id: `slide-${index + 1}`, url: staticHero ? new URL(fallback, manifest.previewUrl).toString() : bg.url, alt: bg.altText || "", caption: "" });
      });
      screen.canvasLayers.forEach(layer => {
        if (layer.type === "text") {
          bindings.push({ path: `texts.${payload.texts.length}.text`, selector: staticHero ? `[data-content-header-${layer.role === "headline" ? "headline" : "copy"}]` : `${selector} .sr-hero-${layer.role}` });
          payload.texts.push({ id: `slide-${index}-${layer.id}`, text: layer.content });
        } else {
          const target = staticHero ? "[data-content-header-cta]" : `${selector} .sr-hero-cta`;
          bindings.push({ path: `links.${payload.links.length}.label`, selector: target }, { path: `links.${payload.links.length}.href`, selector: target, attribute: "href" });
          payload.links.push({ id: `slide-${index}-${layer.id}`, label: layer.content, href: layer.link });
        }
      });
    });
    return [
      configuredBlock(`${page}-hero`, "strip", [page], { label: "Hero / slideshow", fixedRows: true, defaults: payload, presentation: { selector: ".hero", bindings } }),
      configuredBlock(`${page}-reviews`, "testimonials", [page], { label: "Guest reviews", defaults: { heading: profile.testimonials.heading, copy: profile.testimonials.intro, items: profile.testimonials.items.map(item => ({ id: item.id, author: item.authorName, quote: item.quote, role: item.authorRole || "" })) }, presentation: { selector: "[data-showrunner-testimonials]" } }),
    ];
  });
  const selectors: Record<string, string> = { "home-events": "#events", "home-venue-gallery": ".venue-strip", "vendors-directory": ".vendors-directory", "business-info": ".site-footer address" };
  return { ...manifest, previewUrl: process.env.CONTENT_PREVIEW_URL || manifest.previewUrl, blocks: [...dynamic, ...manifest.blocks.map(block => ({ ...block,
    ...(block.type === "business" ? { defaults: { phone: "(870) 219-6982", line1: "3773 County Road 616", city: "Bay", region: "AR", postalCode: "72411" } } : {}),
    ...(selectors[block.id] ? { presentation: { ...block.presentation, selector: selectors[block.id] } } : {})
  }))] };
}

