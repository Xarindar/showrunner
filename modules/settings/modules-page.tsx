import { requireAdmin } from "@/lib/auth";
import { getClientVipSettings } from "@/lib/clients/vip";
import { getSiteSettings } from "@/lib/site";
import { updateClientVipSettingsAction } from "./actions";
import { SettingsNav } from "./settings-nav";
import { ModulesSettingsPanel } from "./modules-settings-panel";

export const dynamic = "force-dynamic";

type SettingsModulesPageProps = {
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function SettingsModulesPage({ searchParams }: SettingsModulesPageProps) {
  await requireAdmin("settings:update");
  const [{ error, saved }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const vipSettings = await getClientVipSettings(settings.siteId);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Module settings</h1>
          <p>Client, scheduling, commerce, and communication settings grouped by module and subcategory.</p>
        </div>
      </header>

      <SettingsNav active="modules" />
      {saved === "clients-vip" ? <div className="success-message">Client VIP settings saved.</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <ModulesSettingsPanel initialVipSettings={vipSettings} updateVipSettingsAction={updateClientVipSettingsAction} />
    </div>
  );
}
