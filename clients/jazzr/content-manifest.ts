import strips from "./page-strips.json";
import { type ContentBlockConfig, configuredBlock, validateManifest } from "@/modules/content/studio/manifest";

export const jazzrContentManifest = validateManifest({
  version: 1, id: "jazzr", previewUrl: "https://jazzrphotography.com/",
  pages: [{ id: "home", path: "/", label: "Homepage" }, { id: "portfolio", path: "/portfolio", label: "Portfolio" }, { id: "about", path: "/about", label: "About" }, { id: "contact", path: "/contact", label: "Contact" }, { id: "booking", path: "/booking.html", label: "Booking" }],
  booking: { path: "/booking.html" },
  blocks: [configuredBlock("home-header-photo", "strip", ["home"], {
      label: "Homepage header", editableFields: ["images", "texts", "links"],
      defaults: { texts: [], images: [], links: [] }, limits: { images: 1, texts: 2, links: 3 },
      presentation: { selector: ".hero" },
    }),
    ...(strips as ContentBlockConfig[]),
    configuredBlock("home-featured-sessions", "featured", ["home"], {
      label: "Featured sessions", source: "services", fixedRows: true, editableFields: ["items"],
      limits: { items: 2 }, minimums: { items: 2 },
      defaults: { items: [
        { id: "session-1", referenceId: "cmwgxm91v000i0xrxymdrfqi2" },
        { id: "session-2", referenceId: "cmv3734fd00310xo0g0h2ucvm" },
      ] },
      presentation: { selector: "#selected-work" },
    }),
    configuredBlock("booking-intro", "strip", ["booking"], {
      label: "Booking introduction", editableFields: ["texts"], fixedRows: true,
      defaults: { texts: [{ id: "heading", text: "Book Jazzr Photography" }], images: [], links: [] },
      presentation: { selector: ".booking-intro", bindings: [{ path: "texts.0.text", selector: "#booking-title" }] },
    }),
  ],
});
