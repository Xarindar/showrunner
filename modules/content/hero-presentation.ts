import type { SiteSettingsWithModules } from "@/lib/site";

export const HERO_GRID_COLUMNS = 30;
export const HERO_GRID_ROWS = 18;
export const HERO_AUTOPLAY_INTERVAL_MS = 6500;

export const heroElementTypes = ["IMAGE", "HEADLINE", "CAPTION", "CTA"] as const;
export const heroCanvasLayerElementTypes = ["HEADLINE", "CAPTION", "CTA"] as const;
export const heroPresentationModes = ["STATIC", "SLIDESHOW"] as const;

export type HeroElementType = (typeof heroElementTypes)[number];
export type HeroCanvasLayerElementType = (typeof heroCanvasLayerElementTypes)[number];
export type HeroPresentationModeValue = (typeof heroPresentationModes)[number];

export type HeroElementLayout = {
  type: HeroElementType;
  gridColumn: number;
  gridRow: number;
  columnSpan: number;
  rowSpan: number;
  zIndex: number;
  isVisible: boolean;
};

export type HeroCanvasLayerElementLayout = HeroElementLayout & {
  type: HeroCanvasLayerElementType;
};

export type HeroSlideEditor = {
  id?: string;
  clientId: string;
  sortOrder: number;
  headline: string;
  caption: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  elements: Record<HeroElementType, HeroElementLayout>;
};

export type HeroPresentationEditor = {
  mode: HeroPresentationModeValue;
  autoplayIntervalMs: number;
  slides: HeroSlideEditor[];
};

export type HeroCanvasLayout = {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
};

export type HeroCanvasBackground = {
  id: string;
  type: "image";
  url: string;
  altText: string;
};

export type HeroCanvasLayer =
  | {
      id: string;
      type: "text";
      role: "headline" | "caption";
      content: string;
      style: {
        color: string;
        fontSize: string;
      };
      layout: HeroCanvasLayout;
    }
  | {
      id: string;
      type: "button";
      role: "cta";
      content: string;
      link: string;
      style: {
        theme: "primary";
      };
      layout: HeroCanvasLayout;
    };

export type HeroCanvasConfig = {
  sectionId: string;
  backgrounds: HeroCanvasBackground[];
  canvasLayers: HeroCanvasLayer[];
};

export type HeroCanvasPayload = {
  hero: HeroCanvasConfig;
  slideshow?: {
    autoplayIntervalMs: number;
    screens: HeroCanvasConfig[];
  };
};

type HeroElementRecordLike = {
  type: string;
  gridColumn: number;
  gridRow: number;
  columnSpan: number;
  rowSpan: number;
  zIndex: number;
  isVisible: boolean;
};

type HeroSlideRecordLike = {
  id?: string;
  sortOrder: number;
  headline: string;
  caption: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  elements?: HeroElementRecordLike[];
};

type HeroPresentationRecordLike = {
  mode: string;
  autoplayIntervalMs: number;
  slides?: HeroSlideRecordLike[];
} | null;

const heroElementFootprints: Record<HeroElementType, Pick<HeroElementLayout, "columnSpan" | "rowSpan">> = {
  IMAGE: { columnSpan: 30, rowSpan: 18 },
  HEADLINE: { columnSpan: 18, rowSpan: 2 },
  CAPTION: { columnSpan: 15, rowSpan: 3 },
  CTA: { columnSpan: 5, rowSpan: 2 }
};

export function defaultHeroElementLayout(type: HeroElementType): HeroElementLayout {
  if (type === "IMAGE") {
    return {
      type,
      gridColumn: 1,
      gridRow: 1,
      ...heroElementFootprints.IMAGE,
      zIndex: 1,
      isVisible: true
    };
  }

  if (type === "HEADLINE") {
    return {
      type,
      gridColumn: 1,
      gridRow: 1,
      ...heroElementFootprints.HEADLINE,
      zIndex: 2,
      isVisible: true
    };
  }

  if (type === "CAPTION") {
    return {
      type,
      gridColumn: 1,
      gridRow: 5,
      ...heroElementFootprints.CAPTION,
      zIndex: 3,
      isVisible: true
    };
  }

  return {
    type,
    gridColumn: 1,
    gridRow: 10,
    ...heroElementFootprints.CTA,
    zIndex: 4,
    isVisible: true
  };
}

export function heroElementLabel(type: HeroElementType) {
  if (type === "IMAGE") return "Image";
  if (type === "HEADLINE") return "Title";
  if (type === "CAPTION") return "Caption";
  return "CTA";
}

export function clampHeroElementLayout(input: HeroElementLayout): HeroElementLayout {
  const columnSpan = clampInteger(input.columnSpan, 1, HERO_GRID_COLUMNS);
  const rowSpan = clampInteger(input.rowSpan, 1, HERO_GRID_ROWS);

  return {
    ...input,
    gridColumn: clampInteger(input.gridColumn, 1, HERO_GRID_COLUMNS - columnSpan + 1),
    gridRow: clampInteger(input.gridRow, 1, HERO_GRID_ROWS - rowSpan + 1),
    columnSpan,
    rowSpan,
    zIndex: clampInteger(input.zIndex, 1, 20),
    isVisible: input.isVisible !== false
  };
}

// Keeps the element's anchor cell and shrinks its footprint at the grid edges
// instead of pushing the anchor back, so assets can sit flush against the
// right and bottom of the image even when their default footprint is wide.
export function fitHeroElementLayoutToContent(input: HeroElementLayout): HeroElementLayout {
  const footprint = heroElementFootprints[input.type];
  const gridColumn = clampInteger(input.gridColumn, 1, HERO_GRID_COLUMNS);
  const gridRow = clampInteger(input.gridRow, 1, HERO_GRID_ROWS);

  return {
    ...input,
    gridColumn,
    gridRow,
    columnSpan: Math.min(footprint.columnSpan, HERO_GRID_COLUMNS - gridColumn + 1),
    rowSpan: Math.min(footprint.rowSpan, HERO_GRID_ROWS - gridRow + 1),
    zIndex: clampInteger(input.zIndex, 1, 20),
    isVisible: input.isVisible !== false
  };
}

// Site settings plus optional per-venue CTA fallbacks, so venue profiles can
// seed new presentations with their own button copy instead of "/book".
export type HeroFallbackContent = Pick<SiteSettingsWithModules, "heroHeadline" | "heroImageUrl" | "heroSubheadline"> & {
  heroCtaHref?: string;
  heroCtaLabel?: string;
};

export function defaultHeroSlideFromSettings(settings: HeroFallbackContent): HeroSlideEditor {
  return {
    clientId: "hero-slide-default",
    sortOrder: 0,
    headline: settings.heroHeadline,
    caption: settings.heroSubheadline,
    imageUrl: settings.heroImageUrl || "/hero.svg",
    ctaLabel: settings.heroCtaLabel || "Book an appointment",
    ctaHref: normalizeCtaHref(settings.heroCtaHref || "/book"),
    elements: defaultHeroElements()
  };
}

export function normalizeHeroPresentation(
  presentation: HeroPresentationRecordLike,
  settings: HeroFallbackContent
): HeroPresentationEditor {
  const fallback = defaultHeroSlideFromSettings(settings);
  const slides = (presentation?.slides || [])
    .slice()
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((slide, index) => normalizeHeroSlide(slide, index, fallback))
    .filter((slide) => slide.headline || slide.caption || slide.imageUrl || slide.ctaLabel);

  return {
    mode: presentation?.mode === "SLIDESHOW" && slides.length > 1 ? "SLIDESHOW" : "STATIC",
    autoplayIntervalMs: clampInteger(presentation?.autoplayIntervalMs ?? HERO_AUTOPLAY_INTERVAL_MS, 2500, 20000),
    slides: slides.length ? slides : [fallback]
  };
}

export function parseHeroPresentationPayload(raw: FormDataEntryValue | null, fallback: HeroPresentationEditor): HeroPresentationEditor {
  if (typeof raw !== "string" || !raw.trim()) return fallback;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return fallback;

    const slidesValue = Array.isArray(parsed.slides) ? parsed.slides : [];
    const slides = slidesValue
      .slice(0, 8)
      .map((slide, index) => normalizeHeroSlide(isRecord(slide) ? slide : {}, index, fallback.slides[0]))
      .filter((slide) => slide.headline || slide.caption || slide.imageUrl || slide.ctaLabel);

    const normalizedSlides = slides.length ? slides : [fallback.slides[0]];

    return {
      mode: parsed.mode === "SLIDESHOW" && normalizedSlides.length > 1 ? "SLIDESHOW" : "STATIC",
      autoplayIntervalMs: clampInteger(numberFromUnknown(parsed.autoplayIntervalMs, fallback.autoplayIntervalMs), 2500, 20000),
      slides: normalizedSlides
    };
  } catch {
    return fallback;
  }
}

export function serializeHeroPresentation(presentation: HeroPresentationEditor) {
  return JSON.stringify(presentation);
}

export function toHeroCanvasPayload(presentation: HeroPresentationEditor): HeroCanvasPayload {
  const screens = presentation.slides.map((slide, index) => toHeroCanvasConfig(slide, index));
  const hero = screens[0] || toHeroCanvasConfig(defaultHeroSlideFromSettings({ heroHeadline: "", heroImageUrl: "/hero.svg", heroSubheadline: "" }), 0);

  if (presentation.mode === "SLIDESHOW" && screens.length > 1) {
    return {
      hero,
      slideshow: {
        autoplayIntervalMs: presentation.autoplayIntervalMs,
        screens
      }
    };
  }

  return { hero };
}

export function toHeroCanvasConfig(slide: HeroSlideEditor, index = 0): HeroCanvasConfig {
  const sectionId = `canvas-hero-${String(index + 1).padStart(2, "0")}`;
  const canvasLayers: HeroCanvasLayer[] = [
    {
      id: "layer-headline",
      type: "text",
      role: "headline",
      content: slide.headline,
      style: { fontSize: "4rem", color: "#ffffff" },
      layout: toHeroCanvasLayout(slide.elements.HEADLINE)
    },
    {
      id: "layer-caption",
      type: "text",
      role: "caption",
      content: slide.caption,
      style: { fontSize: "1.1rem", color: "rgba(255,255,255,0.86)" },
      layout: toHeroCanvasLayout(slide.elements.CAPTION)
    },
    {
      id: "layer-cta",
      type: "button",
      role: "cta",
      content: slide.ctaLabel || "Book an appointment",
      link: slide.ctaHref || "/book",
      style: { theme: "primary" },
      layout: toHeroCanvasLayout(slide.elements.CTA)
    }
  ];

  return {
    sectionId,
    backgrounds: [
      {
        id: `bg-${String(index + 1).padStart(2, "0")}`,
        type: "image",
        url: slide.imageUrl || "/hero.svg",
        altText: heroBackgroundAltText(slide)
      }
    ],
    canvasLayers: canvasLayers.filter((layer) => slide.elements[heroElementTypeFromLayerRole(layer.role)].isVisible)
  };
}

export function toHeroCanvasLayout(layout: HeroElementLayout): HeroCanvasLayout {
  const safeLayout = fitHeroElementLayoutToContent(layout);

  return {
    colStart: safeLayout.gridColumn,
    colEnd: safeLayout.gridColumn + safeLayout.columnSpan,
    rowStart: safeLayout.gridRow,
    rowEnd: safeLayout.gridRow + safeLayout.rowSpan
  };
}

export function heroElementsArray(elements: Record<HeroElementType, HeroElementLayout>) {
  return heroElementTypes.map((type) => elements[type]);
}

export function heroCanvasLayerElementsArray(elements: Record<HeroElementType, HeroElementLayout>): HeroCanvasLayerElementLayout[] {
  return heroCanvasLayerElementTypes.map((type) => ({ ...elements[type], type }));
}

export function withUpdatedHeroElement(
  slide: HeroSlideEditor,
  type: HeroElementType,
  input: Partial<HeroElementLayout>
): HeroSlideEditor {
  const current = slide.elements[type] || defaultHeroElementLayout(type);

  return {
    ...slide,
    elements: {
      ...slide.elements,
      [type]: fitHeroElementLayoutToContent({
        ...current,
        ...input,
        type
      })
    }
  };
}

export function createHeroSlideCopy(slide: HeroSlideEditor, index: number): HeroSlideEditor {
  return {
    ...slide,
    id: undefined,
    clientId: `hero-slide-${Date.now()}-${index}`,
    sortOrder: index,
    headline: slide.headline || "New hero screen",
    elements: cloneHeroElements(slide.elements)
  };
}

export function createBlankHeroSlide(index: number, settings: HeroFallbackContent): HeroSlideEditor {
  const fallback = defaultHeroSlideFromSettings(settings);

  return {
    ...fallback,
    id: undefined,
    clientId: `hero-slide-${Date.now()}-${index}`,
    sortOrder: index,
    headline: "New hero screen",
    caption: fallback.caption,
    elements: defaultHeroElements()
  };
}

function normalizeHeroSlide(input: unknown, index: number, fallback: HeroSlideEditor): HeroSlideEditor {
  const record = isRecord(input) ? input : {};
  const id = stringFromUnknown(record.id);

  return {
    id: id || undefined,
    clientId: id || stringFromUnknown(record.clientId) || `hero-slide-${index}`,
    sortOrder: index,
    headline: stringFromUnknown(record.headline) || fallback.headline,
    caption: stringFromUnknown(record.caption) || fallback.caption,
    imageUrl: stringFromUnknown(record.imageUrl) || fallback.imageUrl || "/hero.svg",
    ctaLabel: stringFromUnknown(record.ctaLabel) || fallback.ctaLabel || "Book an appointment",
    ctaHref: normalizeCtaHref(stringFromUnknown(record.ctaHref) || fallback.ctaHref || "/book"),
    elements: normalizeHeroElements(record.elements, fallback.elements)
  };
}

function normalizeHeroElements(input: unknown, fallback: Record<HeroElementType, HeroElementLayout>) {
  const normalized = cloneHeroElements(fallback);
  const records = Array.isArray(input) ? input : isRecord(input) ? Object.values(input) : [];

  for (const value of records) {
    if (!isRecord(value) || !isHeroElementType(value.type)) continue;

    normalized[value.type] = fitHeroElementLayoutToContent({
      type: value.type,
      gridColumn: numberFromUnknown(value.gridColumn, normalized[value.type].gridColumn),
      gridRow: numberFromUnknown(value.gridRow, normalized[value.type].gridRow),
      columnSpan: numberFromUnknown(value.columnSpan, normalized[value.type].columnSpan),
      rowSpan: numberFromUnknown(value.rowSpan, normalized[value.type].rowSpan),
      zIndex: numberFromUnknown(value.zIndex, normalized[value.type].zIndex),
      isVisible: value.isVisible !== false
    });
  }

  for (const type of heroElementTypes) {
    normalized[type] = fitHeroElementLayoutToContent(normalized[type] || defaultHeroElementLayout(type));
  }

  return normalized;
}

function defaultHeroElements(): Record<HeroElementType, HeroElementLayout> {
  return {
    IMAGE: defaultHeroElementLayout("IMAGE"),
    HEADLINE: defaultHeroElementLayout("HEADLINE"),
    CAPTION: defaultHeroElementLayout("CAPTION"),
    CTA: defaultHeroElementLayout("CTA")
  };
}

function cloneHeroElements(elements: Record<HeroElementType, HeroElementLayout>) {
  return {
    IMAGE: { ...elements.IMAGE },
    HEADLINE: { ...elements.HEADLINE },
    CAPTION: { ...elements.CAPTION },
    CTA: { ...elements.CTA }
  };
}

function isHeroElementType(value: unknown): value is HeroElementType {
  return typeof value === "string" && heroElementTypes.includes(value as HeroElementType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberFromUnknown(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeCtaHref(value: string) {
  if (!value) return "/book";
  if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:")) {
    return value;
  }

  return `/${value.replace(/^\/+/, "")}`;
}

function heroElementTypeFromLayerRole(role: HeroCanvasLayer["role"]): HeroCanvasLayerElementType {
  if (role === "headline") return "HEADLINE";
  if (role === "caption") return "CAPTION";
  return "CTA";
}

function heroBackgroundAltText(slide: Pick<HeroSlideEditor, "headline">) {
  return slide.headline ? `${slide.headline} hero background` : "Homepage hero background";
}
