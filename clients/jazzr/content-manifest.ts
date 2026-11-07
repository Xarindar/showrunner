import strips from "./page-strips.json";
import { type ContentBlockConfig, configuredBlock, validateManifest } from "@/modules/content/studio/manifest";

export const jazzrContentManifest = validateManifest({
  version: 1, id: "jazzr", previewUrl: "https://jazzrphotography.com/",
  pages: [{ id: "home", path: "/", label: "Homepage" }, { id: "portfolio", path: "/portfolio", label: "Portfolio" }, { id: "about", path: "/about", label: "About" }, { id: "contact", path: "/contact", label: "Contact" }, { id: "booking", path: "/booking.html", label: "Booking" }],
  booking: { path: "/booking.html" },
  blocks: [configuredBlock("home-header-photo", "strip", ["home"], {
      label: "Header photo (empty uses portfolio)", editableFields: ["images"],
      defaults: { texts: [], images: [], links: [] }, limits: { images: 1 },
      presentation: { selector: ".hero" },
    }),
    ...(strips as ContentBlockConfig[]),
    configuredBlock("booking-intro", "strip", ["booking"], {
      label: "Booking introduction", editableFields: ["texts"], fixedRows: true,
      defaults: { texts: [{ id: "heading", text: "Book Jazzr Photography" }], images: [], links: [] },
      presentation: { selector: ".booking-intro", bindings: [{ path: "texts.0.text", selector: "#booking-title" }] },
    }),
  ],
});
