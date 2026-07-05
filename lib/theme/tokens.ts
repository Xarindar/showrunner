import type { CSSProperties } from "react";
import { parseStoredThemePalette, type ParsedThemePalette } from "./palette-url";

type ThemePreset = {
  label: string;
  colors: {
    page: string;
    surface: string;
    surfaceRaised: string;
    surfaceSunken: string;
    text: string;
    muted: string;
    border: string;
    brand: string;
    brandDark: string;
    accent: string;
    danger: string;
    success: string;
  };
  spacing: Record<"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12", string>;
  radius: {
    control: string;
    card: string;
    pill: string;
  };
  shadow: {
    hairline: string;
    panel: string;
    raised: string;
    footer: string;
  };
  type: {
    sans: string;
    mono: string;
    scale: {
      display: string;
      h1: string;
      h2: string;
      h3: string;
      body: string;
      small: string;
      caption: string;
    };
    leading: {
      tight: string;
      normal: string;
      relaxed: string;
    };
  };
  motion: {
    fast: string;
    standard: string;
    ease: string;
  };
  layout: {
    adminSidebar: string;
    contentMax: string;
    controlHeight: string;
    rowHeight: string;
    pageHeaderMin: string;
    cardMin: string;
    statMin: string;
  };
};

const spacingScale = {
  "1": "4px",
  "2": "8px",
  "3": "12px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "7": "32px",
  "8": "40px",
  "9": "48px",
  "10": "64px",
  "11": "80px",
  "12": "96px"
} satisfies ThemePreset["spacing"];

const typeScale = {
  display: "3rem",
  h1: "2.05rem",
  h2: "1.55rem",
  h3: "1.12rem",
  body: "0.94rem",
  small: "0.84rem",
  caption: "0.76rem"
} satisfies ThemePreset["type"]["scale"];

const leading = {
  tight: "1.08",
  normal: "1.5",
  relaxed: "1.65"
} satisfies ThemePreset["type"]["leading"];

const sans = 'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const mono = 'var(--font-geist-mono), "SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const themePresets = {
  clean: {
    label: "Clean",
    colors: {
      page: "#f6f4ef",
      surface: "#ffffff",
      surfaceRaised: "#fffefa",
      surfaceSunken: "#efeee8",
      text: "#17211f",
      muted: "#5f6965",
      border: "#ddd8cf",
      brand: "#0f766e",
      brandDark: "#0a4f49",
      accent: "#b66d3a",
      danger: "#b4433e",
      success: "#287c54"
    },
    spacing: spacingScale,
    radius: {
      control: "8px",
      card: "8px",
      pill: "999px"
    },
    shadow: {
      hairline: "0 1px 0 rgba(255, 255, 255, 0.78)",
      panel: "0 1px 2px rgba(22, 29, 27, 0.06), 0 18px 42px rgba(22, 29, 27, 0.07)",
      raised: "0 1px 2px rgba(22, 29, 27, 0.08), 0 12px 28px rgba(22, 29, 27, 0.08)",
      footer: "0 -1px 2px rgba(22, 29, 27, 0.06), 0 -18px 42px rgba(22, 29, 27, 0.08)"
    },
    type: {
      sans,
      mono,
      scale: typeScale,
      leading
    },
    motion: {
      fast: "160ms",
      standard: "260ms",
      ease: "cubic-bezier(0.2, 0.8, 0.2, 1)"
    },
    layout: {
      adminSidebar: "260px",
      contentMax: "1180px",
      controlHeight: "40px",
      rowHeight: "58px",
      pageHeaderMin: "74px",
      cardMin: "214px",
      statMin: "136px"
    }
  },
  editorial: {
    label: "Editorial",
    colors: {
      page: "#f5f3ef",
      surface: "#ffffff",
      surfaceRaised: "#fffefd",
      surfaceSunken: "#edeee9",
      text: "#1d2026",
      muted: "#616874",
      border: "#ddd9d2",
      brand: "#324d63",
      brandDark: "#203748",
      accent: "#a75c4a",
      danger: "#a23d38",
      success: "#337050"
    },
    spacing: spacingScale,
    radius: {
      control: "6px",
      card: "6px",
      pill: "999px"
    },
    shadow: {
      hairline: "0 1px 0 rgba(255, 255, 255, 0.74)",
      panel: "0 1px 2px rgba(32, 33, 35, 0.07), 0 18px 42px rgba(32, 33, 35, 0.08)",
      raised: "0 1px 2px rgba(32, 33, 35, 0.09), 0 12px 28px rgba(32, 33, 35, 0.09)",
      footer: "0 -1px 2px rgba(32, 33, 35, 0.07), 0 -18px 42px rgba(32, 33, 35, 0.09)"
    },
    type: {
      sans,
      mono,
      scale: typeScale,
      leading
    },
    motion: {
      fast: "150ms",
      standard: "250ms",
      ease: "cubic-bezier(0.22, 0.7, 0.18, 1)"
    },
    layout: {
      adminSidebar: "268px",
      contentMax: "1160px",
      controlHeight: "40px",
      rowHeight: "58px",
      pageHeaderMin: "74px",
      cardMin: "214px",
      statMin: "136px"
    }
  },
  warm: {
    label: "Warm",
    colors: {
      page: "#f7f4ef",
      surface: "#fffdf9",
      surfaceRaised: "#fffaf1",
      surfaceSunken: "#eee5dc",
      text: "#28241f",
      muted: "#716a61",
      border: "#ded5ca",
      brand: "#8c5543",
      brandDark: "#633727",
      accent: "#34736c",
      danger: "#a33d35",
      success: "#3b754c"
    },
    spacing: spacingScale,
    radius: {
      control: "8px",
      card: "8px",
      pill: "999px"
    },
    shadow: {
      hairline: "0 1px 0 rgba(255, 255, 255, 0.72)",
      panel: "0 1px 2px rgba(43, 39, 34, 0.07), 0 18px 42px rgba(43, 39, 34, 0.08)",
      raised: "0 1px 2px rgba(43, 39, 34, 0.09), 0 12px 28px rgba(43, 39, 34, 0.09)",
      footer: "0 -1px 2px rgba(43, 39, 34, 0.07), 0 -18px 42px rgba(43, 39, 34, 0.09)"
    },
    type: {
      sans,
      mono,
      scale: typeScale,
      leading
    },
    motion: {
      fast: "170ms",
      standard: "280ms",
      ease: "cubic-bezier(0.2, 0.82, 0.24, 1)"
    },
    layout: {
      adminSidebar: "260px",
      contentMax: "1180px",
      controlHeight: "40px",
      rowHeight: "58px",
      pageHeaderMin: "74px",
      cardMin: "214px",
      statMin: "136px"
    }
  }
} satisfies Record<string, ThemePreset>;

export type ThemePresetId = keyof typeof themePresets;

export const themePresetOptions = Object.entries(themePresets).map(([id, preset]) => ({
  id: id as ThemePresetId,
  label: preset.label
}));

export function normalizeThemePreset(value: unknown): ThemePresetId {
  return typeof value === "string" && value in themePresets ? (value as ThemePresetId) : "clean";
}

function withBrandOverride(preset: ThemePreset, primary?: string | null): ThemePreset {
  if (!primary || !/^#[0-9a-fA-F]{6}$/.test(primary)) return preset;
  const brandDark = mixHex(primary, "#000000", 0.32);
  const accent = ensureContrast(rotateHue(primary, 42), preset.colors.surface, 4.5);

  return {
    ...preset,
    colors: {
      ...preset.colors,
      brand: primary,
      brandDark,
      accent
    }
  };
}

function withPaletteOverride(preset: ThemePreset, palette: ParsedThemePalette): ThemePreset {
  const [primary, accent = preset.colors.accent, neutral = preset.colors.surfaceSunken, text = preset.colors.text, background = preset.colors.page] =
    palette.colors;
  const surfaceSunken = mixHex(neutral, background, 0.22);
  const surface = mixHex(background, "#ffffff", 0.62);
  const surfaceRaised = mixHex(background, "#ffffff", 0.78);
  const border = mixHex(neutral, text, 0.14);
  const mutedText = ensureContrast(mixHex(text, background, 0.34), background, 4.5);
  const brandDark = ensureContrast(mixHex(primary, text, 0.32), surface, 4.5);

  return {
    ...preset,
    colors: {
      ...preset.colors,
      page: background,
      surface,
      surfaceRaised,
      surfaceSunken,
      text,
      muted: mutedText,
      border,
      brand: primary,
      brandDark,
      accent
    }
  };
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(a: string, b: string, weight: number) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  return rgbToHex(
    first.r * (1 - weight) + second.r * weight,
    first.g * (1 - weight) + second.g * weight,
    first.b * (1 - weight) + second.b * weight
  );
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureContrast(foreground: string, background: string, minRatio: number) {
  let color = foreground;
  const darkened = mixHex(color, "#000000", 0.08);
  const lightened = mixHex(color, "#ffffff", 0.08);
  const contrastTarget = contrastRatio(darkened, background) >= contrastRatio(lightened, background) ? "#000000" : "#ffffff";

  for (let step = 0; step < 12 && contrastRatio(color, background) < minRatio; step += 1) {
    color = mixHex(color, contrastTarget, 0.08);
  }
  return color;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    if (max === green) hue = (blue - red) / delta + 2;
    if (max === blue) hue = (red - green) / delta + 4;
    hue *= 60;
  }

  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [red, green, blue] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255
  };
}

function rotateHue(hex: string, degrees: number) {
  const hsl = rgbToHsl(hexToRgb(hex));
  const hue = (hsl.h + degrees) % 360;
  const rgb = hslToRgb({ h: hue, s: Math.max(0.3, hsl.s * 0.8), l: Math.min(0.62, Math.max(0.38, hsl.l)) });
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function themeToCssVars(input: { themePreset?: string | null; themePrimary?: string | null }): CSSProperties {
  const basePreset = themePresets[normalizeThemePreset(input.themePreset)];
  const storedPalette = parseStoredThemePalette(input.themePrimary);
  const preset = storedPalette ? withPaletteOverride(basePreset, storedPalette) : withBrandOverride(basePreset, input.themePrimary);
  const accentContrast = contrastRatio("#ffffff", preset.colors.accent) >= 4.5
    ? "#ffffff"
    : ensureContrast(preset.colors.text, preset.colors.accent, 4.5);

  return {
    "--color-page": preset.colors.page,
    "--color-surface": preset.colors.surface,
    "--color-surface-raised": preset.colors.surfaceRaised,
    "--color-surface-sunken": preset.colors.surfaceSunken,
    "--color-text": preset.colors.text,
    "--color-muted": preset.colors.muted,
    "--color-border": preset.colors.border,
    "--color-brand": preset.colors.brand,
    "--color-brand-dark": preset.colors.brandDark,
    "--color-brand-soft": `color-mix(in srgb, ${preset.colors.brand} 12%, ${preset.colors.surface})`,
    "--color-brand-border": `color-mix(in srgb, ${preset.colors.brand} 22%, transparent)`,
    "--color-admin-sidebar": `color-mix(in srgb, ${preset.colors.brandDark} 82%, ${preset.colors.text})`,
    "--color-accent": preset.colors.accent,
    "--color-accent-soft": `color-mix(in srgb, ${preset.colors.accent} 18%, ${preset.colors.surface})`,
    "--color-accent-border": `color-mix(in srgb, ${preset.colors.accent} 42%, ${preset.colors.border})`,
    "--color-accent-contrast": accentContrast,
    "--color-danger": preset.colors.danger,
    "--color-success": preset.colors.success,
    "--color-hover": `color-mix(in srgb, ${preset.colors.surface} 86%, ${preset.colors.brand} 14%)`,
    "--color-active": `color-mix(in srgb, ${preset.colors.surface} 78%, ${preset.colors.brand} 22%)`,
    "--color-focus": `color-mix(in srgb, ${preset.colors.brand} 28%, transparent)`,
    "--color-disabled": `color-mix(in srgb, ${preset.colors.muted} 38%, ${preset.colors.surface})`,
    "--space-1": preset.spacing["1"],
    "--space-2": preset.spacing["2"],
    "--space-3": preset.spacing["3"],
    "--space-4": preset.spacing["4"],
    "--space-5": preset.spacing["5"],
    "--space-6": preset.spacing["6"],
    "--space-7": preset.spacing["7"],
    "--space-8": preset.spacing["8"],
    "--space-9": preset.spacing["9"],
    "--space-10": preset.spacing["10"],
    "--space-11": preset.spacing["11"],
    "--space-12": preset.spacing["12"],
    "--radius-control": preset.radius.control,
    "--radius-card": preset.radius.card,
    "--radius-pill": preset.radius.pill,
    "--shadow-hairline": preset.shadow.hairline,
    "--shadow-panel": preset.shadow.panel,
    "--shadow-raised": preset.shadow.raised,
    "--shadow-footer": preset.shadow.footer,
    "--font-sans": preset.type.sans,
    "--font-mono": preset.type.mono,
    "--type-display": preset.type.scale.display,
    "--type-h1": preset.type.scale.h1,
    "--type-h2": preset.type.scale.h2,
    "--type-h3": preset.type.scale.h3,
    "--type-body": preset.type.scale.body,
    "--type-small": preset.type.scale.small,
    "--type-caption": preset.type.scale.caption,
    "--leading-tight": preset.type.leading.tight,
    "--leading-normal": preset.type.leading.normal,
    "--leading-relaxed": preset.type.leading.relaxed,
    "--motion-fast": preset.motion.fast,
    "--motion-standard": preset.motion.standard,
    "--motion-ease": preset.motion.ease,
    "--layout-admin-sidebar": preset.layout.adminSidebar,
    "--layout-content-max": preset.layout.contentMax,
    "--control-height": preset.layout.controlHeight,
    "--row-height": preset.layout.rowHeight,
    "--page-header-min": preset.layout.pageHeaderMin,
    "--card-min": preset.layout.cardMin,
    "--stat-min": preset.layout.statMin
  } as CSSProperties;
}
