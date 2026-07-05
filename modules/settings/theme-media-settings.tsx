import { ColorPaletteInput, EqualGrid } from "@/components/ui";
import { normalizeThemePreset, themePresetOptions } from "@/lib/theme/tokens";

type ThemeMediaSettingsProps = {
  settings: {
    mediaDriver: string;
    themePreset: string | null;
    themePrimary: string | null;
  };
};

const mediaDriverOptions = [
  { label: "Repo assets", value: "REPO" },
  { label: "Server asset folder", value: "SERVER_ASSETS" },
  { label: "Cloudflare R2 uploads", value: "R2" },
  { label: "Cloudflare Images", value: "CLOUDFLARE_IMAGES" }
];

export function ThemeMediaSettings({ settings }: ThemeMediaSettingsProps) {
  return (
    <section className="subpanel form-grid">
      <div>
        <h2 className="compact-title">Theme and media</h2>
        <p>Admit One palette roles map to primary, accent, muted, text, and background.</p>
      </div>

      <ColorPaletteInput
        colorInputId="themePrimary"
        colorInputName="themePrimary"
        defaultValue={settings.themePrimary || "#116466"}
        paletteInputId="themePaletteUrl"
        paletteInputName="themePaletteUrl"
      />

      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="themePreset">Style preset</label>
          <select id="themePreset" name="themePreset" defaultValue={normalizeThemePreset(settings.themePreset)}>
            {themePresetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="mediaDriver">Media mode</label>
          <select id="mediaDriver" name="mediaDriver" defaultValue={settings.mediaDriver}>
            {mediaDriverOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </EqualGrid>
    </section>
  );
}
