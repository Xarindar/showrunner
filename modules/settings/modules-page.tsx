import { Notification } from "@/components/ui/notifications";
import { getClientStatusSettings } from "@/lib/clients/configuration";
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
  const clientStatuses = await getClientStatusSettings(settings.siteId);
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

      <div className="admin-settings-layout"><SettingsNav active="modules" /><div className="stack">
      {saved === "clients-vip" ? <Notification tone="success" queryKey="saved">Client module settings saved.</Notification> : null}
      {error ? <Notification tone="danger" queryKey="error">{error}</Notification> : null}
      <ModulesSettingsPanel initialClientStatuses={clientStatuses} initialVipSettings={vipSettings} updateVipSettingsAction={updateClientVipSettingsAction} />
    </div></div>
    </div>
  );
}
