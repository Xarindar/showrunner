import type { CSSProperties } from "react";

type ThemePreset = {
  label: string;
  colors: {
    page: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    brand: string;
    brandDark: string;
    accent: string;
    danger: string;
    success: string;
  };
  radius: {
    control: string;
    card: string;
    pill: string;
  };
  shadow: {
    panel: string;
    footer: string;
  };
  type: {
    sans: string;
  };
  motion: {
    fast: string;
    standard: string;
    ease: string;
  };
  layout: {
    adminSidebar: string;
    contentMax: string;
  };
};

export const themePresets = {
  clean: {
    label: "Clean",
    colors: {
      page: "#f4f7f5",
      surface: "#ffffff",
      text: "#17211f",
      muted: "#65706c",
      border: "#dae4df",
      brand: "#0f766e",
      brandDark: "#0a4f49",
      accent: "#b66d3a",
      danger: "#b4433e",
      success: "#287c54"
    },
    radius: {
      control: "8px",
      card: "8px",
      pill: "999px"
    },
    shadow: {
      panel: "0 1px 2px rgba(22, 29, 27, 0.06), 0 18px 42px rgba(22, 29, 27, 0.07)",
      footer: "0 -1px 2px rgba(22, 29, 27, 0.06), 0 -18px 42px rgba(22, 29, 27, 0.08)"
    },
    type: {
      sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    motion: {
      fast: "160ms",
      standard: "260ms",
      ease: "cubic-bezier(0.2, 0.8, 0.2, 1)"
    },
    layout: {
      adminSidebar: "260px",
      contentMax: "1180px"
    }
  },
  editorial: {
    label: "Editorial",
    colors: {
      page: "#f5f6f8",
      surface: "#ffffff",
      text: "#1d2026",
      muted: "#666d78",
      border: "#dce1e8",
      brand: "#324d63",
      brandDark: "#203748",
      accent: "#a75c4a",
      danger: "#a23d38",
      success: "#337050"
    },
    radius: {
      control: "6px",
      card: "6px",
      pill: "999px"
    },
    shadow: {
      panel: "0 1px 2px rgba(32, 33, 35, 0.07), 0 18px 42px rgba(32, 33, 35, 0.08)",
      footer: "0 -1px 2px rgba(32, 33, 35, 0.07), 0 -18px 42px rgba(32, 33, 35, 0.09)"
    },
    type: {
      sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    motion: {
      fast: "150ms",
      standard: "250ms",
      ease: "cubic-bezier(0.22, 0.7, 0.18, 1)"
    },
    layout: {
      adminSidebar: "268px",
      contentMax: "1160px"
    }
  },
  warm: {
    label: "Warm",
    colors: {
      page: "#f7f4ef",
      surface: "#fffdf9",
      text: "#28241f",
      muted: "#716a61",
      border: "#ded5ca",
      brand: "#8c5543",
      brandDark: "#633727",
      accent: "#34736c",
      danger: "#a33d35",
      success: "#3b754c"
    },
    radius: {
      control: "8px",
      card: "8px",
      pill: "999px"
    },
    shadow: {
      panel: "0 1px 2px rgba(43, 39, 34, 0.07), 0 18px 42px rgba(43, 39, 34, 0.08)",
      footer: "0 -1px 2px rgba(43, 39, 34, 0.07), 0 -18px 42px rgba(43, 39, 34, 0.09)"
    },
    type: {
      sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    motion: {
      fast: "170ms",
      standard: "280ms",
      ease: "cubic-bezier(0.2, 0.82, 0.24, 1)"
    },
    layout: {
      adminSidebar: "260px",
      contentMax: "1180px"
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
  const accent = rotateHue(primary, 42);

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
  const preset = withBrandOverride(themePresets[normalizeThemePreset(input.themePreset)], input.themePrimary);

  return {
    "--color-page": preset.colors.page,
    "--color-surface": preset.colors.surface,
    "--color-text": preset.colors.text,
    "--color-muted": preset.colors.muted,
    "--color-border": preset.colors.border,
    "--color-brand": preset.colors.brand,
    "--color-brand-dark": preset.colors.brandDark,
    "--color-brand-soft": `color-mix(in srgb, ${preset.colors.brand} 12%, ${preset.colors.surface})`,
    "--color-brand-border": `color-mix(in srgb, ${preset.colors.brand} 22%, transparent)`,
    "--color-admin-sidebar": `color-mix(in srgb, ${preset.colors.brandDark} 82%, ${preset.colors.text})`,
    "--color-accent": preset.colors.accent,
    "--color-danger": preset.colors.danger,
    "--color-success": preset.colors.success,
    "--radius-control": preset.radius.control,
    "--radius-card": preset.radius.card,
    "--radius-pill": preset.radius.pill,
    "--shadow-panel": preset.shadow.panel,
    "--shadow-footer": preset.shadow.footer,
    "--font-sans": preset.type.sans,
    "--motion-fast": preset.motion.fast,
    "--motion-standard": preset.motion.standard,
    "--motion-ease": preset.motion.ease,
    "--layout-admin-sidebar": preset.layout.adminSidebar,
    "--layout-content-max": preset.layout.contentMax
  } as CSSProperties;
}
