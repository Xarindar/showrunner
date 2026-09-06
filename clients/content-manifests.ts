import { configuredBlock, validateManifest, type ContentManifest } from "@/modules/content/studio/manifest";
import { cottageEventStripDefaults, cottageVendorDirectoryDefaults, cottageVenueGalleryDefaults } from "./cottage616/content-defaults";

// Trusted deployment configuration. Add explicit site-ID bindings here as clients are onboarded.
export const siteContentManifests: Record<string, ContentManifest> = {};
export const defaultContentManifest = validateManifest({
  version: 1, id: "default", pages: [{ id: "home", path: "/", label: "Homepage" }],
  blocks: [configuredBlock("home-hero", "hero", ["home"]), configuredBlock("business-info", "business", []), configuredBlock("home-seo", "seo", ["home"])],
});
export const cottageContentManifest = validateManifest({
  version: 1, id: "cottage616", legacyProfiles: true,
  pages: [{ id: "home", path: "/index.html", label: "Cottage 616" }, { id: "hive", path: "/the-hive.html", label: "The Hive" }, { id: "booking", path: "/booking.html", label: "Booking" }, { id: "vendors", path: "/vendors.html", label: "Vendors" }],
  blocks: [
    configuredBlock("home-events", "featured", ["home"], { defaults: cottageEventStripDefaults, label: "Events panel", limits: { items: 3 }, minimums: { items: 3 }, presentation: { assetBaseUrl: "https://cottage616-production.up.railway.app/", variant: "event-strip" }, source: "services", sourceCategory: "events" }),
    configuredBlock("home-venue-gallery", "gallery", ["home"], { defaults: cottageVenueGalleryDefaults, label: "Small venue image carousel", limits: { images: 30 }, presentation: { assetBaseUrl: "https://cottage616-production.up.railway.app/", variant: "image-strip" } }),
    configuredBlock("vendors-directory", "directory", ["vendors"], { defaults: cottageVendorDirectoryDefaults, label: "Vendors", limits: { items: 30 }, presentation: { variant: "vendor-directory" } }),
    configuredBlock("business-info", "business", []),
    ...["home", "hive", "booking", "vendors"].map(page => configuredBlock(`${page}-seo`, "seo", [page], { label: `${page === "home" ? "Homepage" : page === "hive" ? "The Hive" : page === "booking" ? "Booking" : "Vendors"} SEO` }))
  ],
});
export function resolveContentManifest(siteId: string, publicContentConfig: unknown) {
  if (siteContentManifests[siteId]) return validateManifest(siteContentManifests[siteId]);
  // Compatibility detection only for sites with persisted legacy profiles; never enable venue editors globally.
  const config = publicContentConfig as { profiles?: Record<string, unknown> } | null;
  return config?.profiles?.cottage616 || config?.profiles?.["the-hive"] ? cottageContentManifest : defaultContentManifest;
}
