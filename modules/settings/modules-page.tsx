import { requireAdmin } from "@/lib/auth";
import { SettingsNav } from "./settings-nav";
import { ModulesSettingsPanel } from "./modules-settings-panel";

export const dynamic = "force-dynamic";

export default async function SettingsModulesPage() {
  await requireAdmin("settings:update");

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
      <ModulesSettingsPanel />
    </div>
  );
}
