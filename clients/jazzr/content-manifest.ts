import { configuredBlock, validateManifest } from "@/modules/content/studio/manifest";

export const jazzrContentManifest = validateManifest({
  version: 1, id: "jazzr", previewUrl: "https://jazzrphotography.com/",
  pages: [{ id: "home", path: "/", label: "Homepage" }],
  booking: { path: "/booking.html" },
  blocks: [configuredBlock("home-service-categories", "serviceCategories", ["home"], {
    label: "Photography categories", source: "categories",
    defaults: { heading: "A little of your story.", items: [] },
    presentation: { selector: "#photography-categories" },
  })],
});
