export const admitOnePaletteExampleUrl = "https://admitonedesign.com/palette.html#b8231a-c8952a-e9dcc2-1a1710-fbf7ee";

export const admitOnePaletteRoles = ["Primary", "Accent", "Muted", "Text", "Background"] as const;

export type AdmitOnePaletteRole = (typeof admitOnePaletteRoles)[number];

export type ParsedThemePalette = {
  colors: string[];
  primaryColor: string;
};

const hexColorPattern = /^#[0-9a-f]{6}$/;
const paletteValuePattern = /^[0-9a-f]{6}(?:-[0-9a-f]{6}){0,9}$/i;
const storedPalettePrefix = "palette:";

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && hexColorPattern.test(value.toLowerCase());
}

export function normalizeHexColor(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return hexColorPattern.test(withHash) ? withHash : null;
}

export function serializeThemePalette(colors: string[]) {
  const normalized = colors.map(normalizeHexColor).filter(isPresent);
  if (!normalized.length) return "";
  return `${storedPalettePrefix}${normalized.map((color) => color.slice(1)).join("-")}`;
}

export function parseStoredThemePalette(value: unknown): ParsedThemePalette | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith(storedPalettePrefix)) return null;
  return parsePaletteFragment(trimmed.slice(storedPalettePrefix.length));
}

export function parseThemePaletteInput(value: unknown): ParsedThemePalette | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const stored = parseStoredThemePalette(trimmed);
  if (stored) return stored;

  const fragment = extractPaletteFragment(trimmed);
  return parsePaletteFragment(fragment);
}

export function getThemePrimaryColor(value: unknown, fallback = "#116466") {
  const storedPalette = parseStoredThemePalette(value);
  if (storedPalette) return storedPalette.primaryColor;

  return normalizeHexColor(value) || fallback;
}

export function normalizeThemeColorValue(value: unknown, fallback = "#116466") {
  const storedPalette = parseStoredThemePalette(value);
  if (storedPalette) return serializeThemePalette(storedPalette.colors);

  return normalizeHexColor(value) || fallback;
}

function extractPaletteFragment(value: string) {
  try {
    const url = new URL(value);
    if (url.hash) return decodeURIComponent(url.hash.slice(1)).trim();
  } catch {
    // Plain fragments and copied hash values are valid inputs too.
  }

  const hashIndex = value.lastIndexOf("#");
  return (hashIndex >= 0 ? value.slice(hashIndex + 1) : value).trim();
}

function parsePaletteFragment(value: string): ParsedThemePalette | null {
  const normalized = value.trim().replace(/^#/, "").toLowerCase();
  if (!paletteValuePattern.test(normalized)) return null;

  const colors = normalized
    .split("-")
    .map((color) => normalizeHexColor(color))
    .filter(isPresent);

  if (!colors.length) return null;

  return {
    colors,
    primaryColor: colors[0]
  };
}

function isPresent(value: string | null): value is string {
  return Boolean(value);
}
