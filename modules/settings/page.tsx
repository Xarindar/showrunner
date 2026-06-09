import { Save } from "lucide-react";
import { isRequiredModule } from "@/shell/modules";
import type { ModuleStatus } from "@/shell/module-types";
import { getPlatformStatus, platformFoundationItems } from "@/lib/platform-status";
import { getSiteSettings } from "@/lib/site";
import { normalizeThemePreset, themePresetOptions } from "@/lib/theme/tokens";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [{ saved, error }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const platformStatus = await getPlatformStatus(settings);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 style={{ fontSize: "2.4rem" }}>Client configuration</h1>
          <p>Business details, visual basics, media mode, module state, and platform foundations for multi-site, roles, audit, and policy controls.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Settings saved.</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="grid-3" aria-label="Settings structure">
        <div className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Business</h2>
          <p>Identity, contact email, and timezone for public pages and notifications.</p>
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Modules</h2>
          <p>{platformStatus.enabledCount} modules enabled, including required platform modules for the admin shell.</p>
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Security and data</h2>
          <p>{platformFoundationItems.length} foundation items tracked for roles, audit logs, site scoping, and policy controls.</p>
        </div>
      </section>

      <form action={updateSettingsAction} className="card form-grid">
        <section className="subpanel form-grid">
          <h2 style={{ fontSize: "1.2rem" }}>Business</h2>
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

          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <input id="timezone" name="timezone" defaultValue={settings.timezone} required />
          </div>
        </section>

        <section className="subpanel form-grid">
          <h2 style={{ fontSize: "1.2rem" }}>Theme and media</h2>
          <div className="grid-3">
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
            <div className="field">
              <label htmlFor="mediaDriver">Media mode</label>
              <select id="mediaDriver" name="mediaDriver" defaultValue={settings.mediaDriver}>
                <option value="REPO">Repo assets</option>
                <option value="R2">Cloudflare R2 uploads</option>
              </select>
            </div>
          </div>
        </section>

        <section className="subpanel form-grid">
          <div>
            <h2 style={{ fontSize: "1.2rem" }}>Modules</h2>
            <p>Enabled modules appear in the sidebar. Required platform modules stay on so the admin shell remains reachable.</p>
          </div>
          <div className="module-toggle-grid">
            {platformStatus.modules.map((item) => {
              const status = item.module.status as ModuleStatus;
              const required = isRequiredModule(item.module.id);

              return (
                <label key={item.module.id} className="module-toggle-row">
                  {required ? <input type="hidden" name="enabledModules" value={item.module.id} /> : null}
                  <input
                    name="enabledModules"
                    type="checkbox"
                    value={item.module.id}
                    defaultChecked={item.enabled || required}
                    disabled={status === "future" || required}
                  />
                  <span className="module-toggle-main">
                    <span>
                      <strong>{item.module.label}</strong>
                      {required ? <span className="pill">Required</span> : null}
                    </span>
                    <small>{item.module.readiness.summary}</small>
                    {item.module.readiness.primaryGap ? <small>{item.module.readiness.primaryGap}</small> : null}
                  </span>
                  <span className={item.pillClassName}>{item.readinessLabel}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="subpanel form-grid">
          <div>
            <h2 style={{ fontSize: "1.2rem" }}>Security and data foundations</h2>
            <p>These schema and policy items track what is in place and what remains before multi-site rollout.</p>
          </div>
          <div className="foundation-list">
            {platformFoundationItems.map((item) => (
              <div className="foundation-row" key={item.key}>
                <span className={item.status === "schema-ready" ? "pill success" : "pill warning"}>{item.status.replaceAll("-", " ")}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                  <small>Models: {item.models.join(", ")}</small>
                </span>
              </div>
            ))}
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
