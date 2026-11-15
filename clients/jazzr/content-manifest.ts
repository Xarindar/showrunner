import strips from "./page-strips.json";
import { type ContentBlockConfig, configuredBlock, validateManifest } from "@/modules/content/studio/manifest";
import { blockRegistry, emptyFields, emptyPayload } from "@/modules/content/studio/registry";
import { readStudio } from "@/modules/content/studio/state";
import { mobileOverrides, resolveMobilePayload } from "@/modules/content/studio/mobile-overrides";

const layouts = [{ value: "full", label: "Full photo spread" }, { value: "split", label: "Split editorial" }];
const header = { id: "slide-1", ...emptyFields(blockRegistry.slideshow.fields.slides.fields!) };

export const jazzrContentManifest = validateManifest({
  version: 1, id: "jazzr", previewUrl: "https://jazzrphotography.com/",
  pages: [{ id: "home", path: "/", label: "Homepage" }, { id: "portfolio", path: "/portfolio", label: "Portfolio" }, { id: "about", path: "/about", label: "About" }, { id: "contact", path: "/contact", label: "Contact" }, { id: "booking", path: "/booking.html", label: "Booking" }],
  booking: { path: "/booking.html" },
  blocks: [configuredBlock("home-header-photo", "slideshow", ["home"], {
      label: "Header carousel", defaults: { slides: [header] }, minimums: { slides: 1 },
      presentation: { selector: ".hero" },
    }),
    ...[1, 2].map(number => configuredBlock(`home-session-${number}`, "featured", ["home"], {
      label: `Featured session ${number}`, source: "services", editableFields: ["items"], fixedRows: true,
      limits: { items: 1 }, minimums: { items: 1 }, cardVariants: layouts,
      defaults: { ...emptyPayload("featured"), items: [{ ...emptyFields(blockRegistry.featured.fields.items.fields!), id: `session-${number}`, layout: number === 1 ? "split" : "full" }] },
      presentation: { selector: `#featured-session-${number}` },
    })),
    ...(strips as ContentBlockConfig[]),
    configuredBlock("booking-intro", "strip", ["booking"], {
      label: "Booking introduction", editableFields: ["texts"], fixedRows: true,
      defaults: { texts: [{ id: "heading", text: "Book Jazzr Photography" }], images: [], links: [] },
      presentation: { selector: ".booking-intro", bindings: [{ path: "texts.0.text", selector: "#booking-title" }] },
    }),
  ],
});

// Read the previous grouped sections without rewriting published content.
export function jazzrEditorManifest(config: unknown) {
  const stored = readStudio(config).blocks;
  return { ...jazzrContentManifest, blocks: jazzrContentManifest.blocks.map(block => {
    const legacy = block.type === "slideshow" ? stored[block.id]?.payload : block.id.startsWith("home-session-") ? stored["home-featured-sessions"]?.payload : undefined;
    if (!legacy || (block.type === "slideshow" && Array.isArray(legacy.slides))) return block;
    function convert(payload: Record<string, unknown>): Record<string, unknown> {
      if (block.type === "slideshow") {
        const images = (payload.images || []) as Record<string, unknown>[];
        const texts = (payload.texts || []) as { text: string }[];
        const links = (payload.links || []) as { label: string; href: string }[];
        return { slides: Array.from({ length: Math.max(1, images.length, links.length) }, (_, index) => {
          const image = images[index] || images[0] || {};
          return { ...header, id: `slide-${index + 1}`, imageUrl: image.url || "", imageAlt: image.alt || "", imagePositionX: image.imagePositionX ?? 50, imagePositionY: image.imagePositionY ?? 50, imageZoom: image.imageZoom ?? 1, title: texts[0]?.text || "", caption: texts.slice(1).map(row => row.text).join("\n"), buttonLabel: links[index]?.label || "", buttonHref: links[index]?.href || "" };
        }) };
      }
      const rowId = block.id.replace("home-", "");
      const row = (payload.items as Record<string, unknown>[] || []).find(item => item.id === rowId);
      return row ? { ...block.defaults, items: [{ ...emptyFields(blockRegistry.featured.fields.items.fields!), ...row }] } : block.defaults!;
    }
    const defaults = convert(legacy);
    return { ...block, defaults: { ...defaults, mobileOverrides: mobileOverrides(defaults, convert(resolveMobilePayload(legacy))) } };
  }) };
}
