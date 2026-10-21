import type { Field } from "./registry";
import type { ContentManifest } from "./manifest";

export type LinkChoices = { id: string; slug: string; label: string; category: string; group?: string; tags?: string[]; imageFraming?: unknown; imageUrl?: string; description?: string }[];
export type LinkOptions = { pages: ContentManifest["pages"]; services: { label: string; href: string; imageUrl?: string; description?: string; category?: string; group?: string; tags?: string[]; imageFraming?: unknown }[] };
export function destinationKind(href: string, options: LinkOptions) {
  if (options.services.some(service => service.href === href)) return "service";
  if (!href) return "page";
  try { return options.pages.some(page => new URL(href, "https://site.invalid").pathname === page.path) ? "page" : "url"; }
  catch { return "url"; }
}
export function contentLinkOptions(manifest: ContentManifest, services: LinkChoices): LinkOptions {
  return { pages: manifest.pages, services: !manifest.booking ? [] : services.map(service => {
    const params = new URLSearchParams({ service: service.slug, next: "1" });
    const profile = manifest.booking?.profilesByCategory?.[service.category.toLowerCase()];
    if (profile) params.set("profile", profile);
    return { label: service.label, imageUrl: service.imageUrl, description: service.description, category: service.category, group: service.group || serviceGroupLabel(manifest, service.category), tags: service.tags, imageFraming: service.imageFraming, href: `${manifest.booking!.path}?${params}` };
  }) };
}
export function imageFirst(fields: Record<string, Field>) {
  const imageKeys = ["imageUrl", "url", "imageAlt", "alt", "images"];
  const priority = (key: string) => imageKeys.includes(key) ? imageKeys.indexOf(key) : imageKeys.length;
  // Preserve hidden descriptions and references in the payload.
  return Object.entries(fields).filter(([key]) => !["alt", "imageAlt", "locationId", "imagePositionX", "imagePositionY", "imageZoom"].includes(key)).sort(([a], [b]) => priority(a) - priority(b));
}

export function editorPageDestination(href: string, currentUrl: string, pages: ContentManifest["pages"]) {
  try {
    const url = new URL(href, currentUrl);
    if (url.origin !== new URL(currentUrl).origin) return null;
    const path = (value: string) => value.replace(/\/index\.html$/, "/");
    const page = pages.find(page => path(page.path) === path(url.pathname));
    if (!page) return null;
    url.searchParams.delete("showrunner-editor");
    return { pageId: page.id, href: url.href };
  } catch { return null; }
}

export function serviceGroupLabel(manifest: ContentManifest, category: string) {
  const profile = manifest.booking?.profilesByCategory?.[category.toLowerCase()];
  return (profile && manifest.booking?.profileLabels?.[profile]) || category;
}
export function contentFrameKeys(id: string, payload: Record<string, unknown>) {
  return [id, ...Object.entries(payload).flatMap(([key, rows]) => Array.isArray(rows) ? rows.flatMap(row => typeof row?.id === "string" ? [`${id}-${key}-${row.id}`] : []) : [])];
}
