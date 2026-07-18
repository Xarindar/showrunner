import { BrandColorInput, EqualGrid } from "@/components/ui";
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
  { label: "Railway/S3 bucket", value: "S3" },
  { label: "Cloudflare R2 uploads", value: "R2" },
  { label: "Cloudflare Images", value: "CLOUDFLARE_IMAGES" }
];

export function ThemeMediaSettings({ settings }: ThemeMediaSettingsProps) {
  return (
    <section className="subpanel form-grid">
      <div>
        <h2 className="compact-title">Theme and media</h2>
        <p>Choose one brand color. Showrunner owns the neutral surfaces and status colors so the interface stays clear and consistent.</p>
      </div>

      <EqualGrid min="220px">
        <BrandColorInput defaultValue={settings.themePrimary || "#116466"} id="themePrimary" name="themePrimary" />
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
