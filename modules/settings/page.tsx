import { Save } from "lucide-react";
import { moduleRegistry } from "@/shell/modules";
import type { ModuleStatus } from "@/shell/module-types";
import { getSiteSettings } from "@/lib/site";
import { normalizeThemePreset, themePresetOptions } from "@/lib/theme/tokens";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [{ saved, error }, settings] = await Promise.all([searchParams, getSiteSettings()]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 style={{ fontSize: "2.4rem" }}>Client configuration</h1>
          <p>Business details, visual basics, media mode, and enabled modules.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Settings saved.</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <form action={updateSettingsAction} className="card form-grid">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="businessName">Business name</label>
            <input id="businessName" name="businessName" defaultValue={settings.businessName} required />
          </div>
          <div className="field">
            <label htmlFor="contactEmail">Contact email</label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} required />
          </div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <input id="timezone" name="timezone" defaultValue={settings.timezone} required />
          </div>
          <div className="field">
            <label htmlFor="themePreset">Style preset</label>
            <select id="themePreset" name="themePreset" defaultValue={normalizeThemePreset(settings.themePreset)}>
              {themePresetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="themePrimary">Primary color</label>
            <input id="themePrimary" name="themePrimary" type="color" defaultValue={settings.themePrimary} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="mediaDriver">Media mode</label>
            <select id="mediaDriver" name="mediaDriver" defaultValue={settings.mediaDriver}>
              <option value="REPO">Repo assets</option>
              <option value="R2">Cloudflare R2 uploads</option>
            </select>
          </div>
        </div>

        <section className="subpanel">
          <h2 style={{ fontSize: "1.2rem" }}>Sidebar modules</h2>
          <div className="grid-3">
            {moduleRegistry.map((item) => {
              const status = item.status as ModuleStatus;

              return (
                <label key={item.id} className="field" style={{ display: "flex", gap: 8 }}>
                  <input
                    name="enabledModules"
                    type="checkbox"
                    value={item.id}
                    defaultChecked={settings.enabledModuleIds.includes(item.id)}
                    disabled={status === "future"}
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        </section>

        <button className="button" type="submit">
          <Save size={18} />
          Save settings
        </button>
      </form>
    </div>
  );
}
