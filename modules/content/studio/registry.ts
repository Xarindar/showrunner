import { z } from "zod";

export type Field = { label: string; kind: "time" | "text" | "multiline" | "richtext" | "url" | "email" | "list" | "checkbox" | "number"; min?: number; max?: number; default?: number; optional?: boolean; options?: { label: string; value: string }[]; fields?: Record<string, Field> };
const text = (label: string, max = 200): Field => ({ label, kind: "text", max });
const copy = (label: string): Field => ({ label, kind: "multiline", max: 10000 });
const url = (label: string): Field => ({ label, kind: "url", max: 2048 });
const list = (label: string, fields: Record<string, Field>, max = 12): Field => ({ label, kind: "list", fields, max });
const link = { label: text("Label"), href: url("Destination") };
const framing = { imagePositionX: { label: "Horizontal position", kind: "number", min: 0, max: 100, default: 50 } as Field, imagePositionY: { label: "Vertical position", kind: "number", min: 0, max: 100, default: 50 } as Field, imageZoom: { label: "Zoom", kind: "number", min: 1, max: 3, default: 1 } as Field };
const image = { ...framing, url: url("Image URL"), alt: text("Alternative text"), caption: text("Caption", 500) };
const section = { heading: text("Heading"), copy: copy("Copy") };
const cta = { ctaLabel: text("Button label"), ctaHref: url("Button destination") };
const address = { line1: text("Street address"), line2: text("Address line 2"), city: text("City"), region: text("State / region"), postalCode: text("Postal code"), country: text("Country") };
const hours = list("Business hours", { day: text("Weekday (Monday–Sunday)"), opens: { label: "Opens", kind: "time", max: 5 }, closes: { label: "Closes", kind: "time", max: 5 } }, 28);
const checkbox = (label: string): Field => ({ label, kind: "checkbox" });

export const blockRegistry = {
  showcase: { label: "Service / product showcase", fields: { heading: text("Heading"), items: list("Cards", { catalogKey: text("Service or product"), ...framing, imageUrl: { ...url("Image"), optional: true }, displayOnly: checkbox("Display only (hide action)"), variant: text("Card style") }, 30) } },
  slideshow: { label: "Header carousel", fields: { slides: list("Header", { ...framing, imageUrl: url("Image"), imageAlt: text("Alternative text"), title: text("Title"), caption: copy("Caption"), buttonLabel: text("Title"), buttonHref: url("Link to") }, 12) } },
  strip: { label: "Page section", fields: { texts: list("Text", { text: copy("Text") }, 100), images: list("Images", image, 30), links: list("Links", link, 30) } },
  hero: { label: "Header / Hero", fields: { ...section, ...cta, images: list("Images", image, 6) } },
  testimonials: { label: "Reviews / Testimonials", fields: { ...section, items: list("Testimonials", { quote: copy("Quote"), author: text("Author"), role: text("Attribution") }) } },
  announcement: { label: "Announcement banner", fields: { message: text("Message", 500), ...cta } },
  mailingList: { label: "Mailing-list popup", fields: { ...section, ...framing, imageUrl: url("Image URL"), submitLabel: text("Submit label"), successCopy: copy("Success message") } },
  coupon: { label: "Coupon / promo popup", fields: { ...section, code: text("Display code"), ...framing, imageUrl: url("Image URL"), ...cta } },
  cta: { label: "CTA section", fields: { ...section, ...cta } },
  featured: { label: "Featured items", fields: { ...section, ...framing, imageUrl: url("Feature image URL"), imageAlt: text("Feature image alternative text"), items: list("Selected items", { referenceId: text("Service"), imageUrl: { ...url("Image"), optional: true }, ...framing, title: text("Heading (blank uses service name)"), description: copy("Description (blank uses service description)") }) } },
  gallery: { label: "Image gallery / slideshow", fields: { heading: text("Heading"), images: list("Images", image, 30) } },
  directory: { label: "Directory / partners", fields: { ...section, items: list("Directory entries", {
    name: text("Name"), category: text("Category"), offer: copy("Featured offer"), description: copy("Description"),
    ...framing, imageUrl: url("Image URL"), imageAlt: text("Image alternative text"), ctaLabel: text("Button label"),
    phone: url("Phone link"), secondaryPhone: url("Second phone link"), email: url("Email link"), website: url("Website"),
    facebook: url("Facebook"), addressUrl: url("Directions link")
  }, 30) } },
  about: { label: "About / story section", fields: { ...section, copy: { ...copy("Copy"), kind: "richtext" } as Field, ...framing, imageUrl: url("Image URL"), imageAlt: text("Alternative text") } },
  faq: { label: "FAQ section", fields: { heading: text("Heading"), items: list("Questions", { question: text("Question", 500), answer: { ...copy("Answer"), kind: "richtext" } }) } },
  team: { label: "Team / staff spotlight", fields: { ...section, items: list("Team member", { name: text("Name"), role: copy("Role"), bio: copy("Biography"), ...framing, imageUrl: url("Photo URL"), imageAlt: text("Alternative text") }, 30) } },
  contact: { label: "Contact / location section", fields: { ...section, locationId: text("Location ID (blank for primary)") } },
  footer: { label: "Footer content controls", fields: { tagline: text("Tagline"), copy: copy("Copy"), links: list("Links", link) } },
  seo: { label: "Page SEO", fields: { title: text("SEO page title", 200), description: text("Meta description", 500) } },
  business: { label: "Contact / Business Info", fields: {
    businessName: text("Business name"), phone: text("Phone"), email: { label: "Email", kind: "email" } as Field,
    ...address, timezone: text("Timezone"),
    hours,
    socialLinks: list("Social links", { platform: text("Platform"), href: url("Profile URL") }),
    locations: list("Secondary locations", { name: text("Location name"), ...address, overridePhone: checkbox("Use a separate phone number (blank hides it)"), phone: text("Location phone"), overrideEmail: checkbox("Use a separate email (blank hides it)"), email: { label: "Location email", kind: "email" } as Field, overrideHours: checkbox("Use separate hours (empty means closed)"), hours }, 10),
  } },
} satisfies Record<string, { label: string; fields: Record<string, Field> }>;
export type BlockType = keyof typeof blockRegistry;

export function isSafeContentUrl(value: string) {
  if (!value) return true;
  if (/[\u0000-\u0020\\]/.test(value) || value.startsWith("//")) return false;
  if (/^(https?:|mailto:|tel:)/i.test(value)) {
    try { return !["http:", "https:"].includes(new URL(value).protocol) || Boolean(new URL(value).hostname); } catch { return false; }
  }
  return !value.includes(":") && !/^%/i.test(value);
}

export function fieldSchema(field: Field): z.ZodType {
  if (field.kind === "number") return z.number().min(field.min ?? 0).max(field.max ?? 100).default(field.default ?? 0);
  if (field.kind === "checkbox") return z.boolean();
  if (field.kind === "list") return z.array(z.strictObject({ id: z.string().min(1).max(100), ...schemaFields(field.fields!), ...(("catalogKey" in (field.fields || {}) || "referenceId" in (field.fields || {})) ? { imageSource: z.enum(["service", "custom"]).default("service"), useServiceFraming: z.boolean().default(true) } : {}), ...("catalogKey" in (field.fields || {}) ? { catalogKey: z.string().max(200).regex(/^(service|product):[^:]+$/), variant: z.string().max(100) } : {}), ...("referenceId" in (field.fields || {}) ? { title: z.string().max(200).default(""), description: z.string().max(10000).default("") } : {}) }))
    .max(field.max || 12).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Item IDs must be unique");
  let schema = z.string().max(field.max || 200);
  if (field.kind === "url") schema = schema.refine(isSafeContentUrl, "Use a safe website, email, phone, or relative link");
  if (field.kind === "email") schema = schema.refine(value => !value || z.email().safeParse(value).success, "Enter a valid email");
  return field.optional ? schema.default("") : schema;
}
function schemaFields(fields: Record<string, Field>) { return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, fieldSchema(field)])); }
export const mobileOverridesSchema = z.array(z.strictObject({
  path: z.array(z.string().min(1).max(100).refine(key => !["__proto__", "prototype", "constructor", "mobileOverrides"].includes(key))).min(1).max(12),
  value: z.unknown(),
})).max(2000);
export function payloadSchema(type: BlockType) { return z.strictObject({ ...schemaFields(blockRegistry[type].fields), mobileOverrides: mobileOverridesSchema.optional() }); }
export function emptyFields(fields: Record<string, Field>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.kind === "list" ? [] : field.kind === "checkbox" ? false : field.kind === "number" ? field.default ?? 0 : ""]));
}
export function emptyPayload(type: BlockType) { return emptyFields(blockRegistry[type].fields); }
