import { TabLink, Tabs } from "@/components/ui";

type SettingsNavProps = {
  active: "dashboard" | "modules";
};

export function SettingsNav({ active }: SettingsNavProps) {
  return (
    <Tabs aria-label="Settings sections" className="settings-tabs">
      <TabLink aria-selected={active === "dashboard"} href="/admin/modules/settings">
        Dashboard
      </TabLink>
      <TabLink aria-selected={active === "modules"} href="/admin/modules/settings/modules">
        Modules
      </TabLink>
    </Tabs>
  );
}
