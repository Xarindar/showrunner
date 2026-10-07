import type { ContentManifest } from "./manifest";
import { contentLinkOptions } from "./field-layout";
import { isSafeContentUrl } from "./registry";

// Shared by the server and draft preview. Only these public fields cross the iframe boundary.
export type CatalogCard = {
  key: string; id: string; kind: "service" | "product"; slug: string; name: string;
  description: string; imageUrl: string; priceCents: number | null; currency: string;
  durationMinutes: number | null; available: boolean; category: string;
};
export type ShowcaseRow = { id: string; catalogKey: string; displayOnly: boolean; variant: string };
export function resolveShowcase(rows: ShowcaseRow[], catalog: CatalogCard[], manifest: ContentManifest) {
  return rows.flatMap(row => {
    const item = catalog.find(item => item.key === row.catalogKey);
    if (!item) return [];
    let href = "";
    if (!row.displayOnly && item.available) {
      if (item.kind === "service") href = contentLinkOptions(manifest, [{ id: item.id, slug: item.slug, label: item.name, category: item.category }]).services[0]?.href || "";
      else if (manifest.products?.path) {
        const path = manifest.products.path;
        const destination = new URL(path, "https://content.invalid");
        destination.searchParams.set(manifest.products.slugParameter, item.slug);
        href = /^https?:/i.test(path) ? destination.href : `${destination.pathname}${destination.search}${destination.hash}`;
      }
    }
    if (!isSafeContentUrl(href)) href = "";
    return [{ id: row.id, referenceId: item.id, kind: item.kind, name: item.name, description: item.description,
      imageUrl: item.imageUrl, priceCents: item.priceCents, currency: item.currency,
      durationMinutes: item.durationMinutes, available: item.available, variant: row.variant,
      ctaHref: href, ctaLabel: href ? (item.kind === "service" ? "Book now" : "View product") : "" }];
  });
}
