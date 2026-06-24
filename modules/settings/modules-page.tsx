import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { moduleRegistry, type ModuleId } from "@/shell/modules";
import { Badge, Card, EqualGrid } from "@/components/ui";
import { SettingsNav } from "./settings-nav";

export const dynamic = "force-dynamic";

type ModuleSettingStatus = "live" | "next" | "planned";

type ModuleSettingDefinition = {
  moduleId: ModuleId;
  title: string;
  description: string;
  status: ModuleSettingStatus;
  href?: string;
};

const moduleSettingDefinitions = [
  {
    moduleId: "clients",
    title: "VIP client configuration",
    description: "Define VIP client flags, default treatment, priority indicators, and follow-up behavior for client records.",
    status: "next"
  }
] satisfies ModuleSettingDefinition[];

function statusLabel(status: ModuleSettingStatus) {
  const labels = {
    live: "Live",
    next: "Next",
    planned: "Planned"
  } satisfies Record<ModuleSettingStatus, string>;

  return labels[status];
}

function statusClassName(status: ModuleSettingStatus) {
  if (status === "live") return "pill success";
  if (status === "next") return "pill warning";
  return "pill";
}

export default async function SettingsModulesPage() {
  await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const enabledModules = new Set<string>(settings.enabledModuleIds);
  const definitionsByModule = new Map<string, ModuleSettingDefinition[]>();

  for (const definition of moduleSettingDefinitions) {
    definitionsByModule.set(definition.moduleId, [...(definitionsByModule.get(definition.moduleId) || []), definition]);
  }

  const modulesWithSettings = moduleRegistry.filter((module) => {
    return module.settingsSections?.length || definitionsByModule.has(module.id);
  });

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Module settings</h1>
          <p>Settings grouped by the module they affect, so client, scheduling, commerce, content, and communication preferences stay close to their owning workflows.</p>
        </div>
      </header>

      <SettingsNav active="modules" />

      <EqualGrid aria-label="Module settings summary" as="section" min="220px">
        <Card>
          <h2 className="compact-title">Modules mapped</h2>
          <p>{modulesWithSettings.length} modules currently advertise settings areas or upcoming module-owned settings.</p>
        </Card>
        <Card>
          <h2 className="compact-title">Next setting</h2>
          <p>VIP client configuration is queued under Clients as the first module-owned settings workspace.</p>
        </Card>
        <Card>
          <h2 className="compact-title">Scope</h2>
          <p>This page organizes configuration by workflow. It does not enable, disable, install, or remove modules.</p>
        </Card>
      </EqualGrid>

      <section className="module-settings-grid" aria-label="Settings by module">
        {modulesWithSettings.map((module) => {
          const definitions = definitionsByModule.get(module.id) || [];
          const enabled = enabledModules.has(module.id);

          return (
            <Card as="section" key={module.id} minHeight="none" bodyClassName="module-settings-card">
              <div className="module-settings-card-head">
                <div>
                  <p className="eyebrow">{module.id}</p>
                  <h2 className="compact-title">{module.label}</h2>
                  <p>{module.description}</p>
                </div>
                <span className="settings-chip-list" aria-label={`${module.label} status`}>
                  {module.required ? <Badge>Required</Badge> : null}
                  <Badge tone={enabled ? "success" : "warning"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                </span>
              </div>

              {module.settingsSections?.length ? (
                <div className="settings-module-section-list" aria-label={`${module.label} setting areas`}>
                  {module.settingsSections.map((section) => (
                    <span className="settings-module-chip" key={section}>
                      {section}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="module-settings-list">
                {definitions.length ? (
                  definitions.map((definition) => (
                    <div className="module-setting-row" key={definition.title}>
                      <span>
                        <strong>{definition.title}</strong>
                        <small>{definition.description}</small>
                      </span>
                      <span className={statusClassName(definition.status)}>{statusLabel(definition.status)}</span>
                    </div>
                  ))
                ) : (
                  <p className="ui-zero">No dedicated settings have been promoted into this Modules view yet.</p>
                )}
              </div>

              {module.href && module.id !== "settings" ? (
                <Link className="settings-module-link" href={module.href}>
                  Open {module.label}
                </Link>
              ) : null}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
