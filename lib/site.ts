import type { SiteSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEnabledModuleIds } from "@/lib/modules/installation";
import { defaultEnabledModules, normalizeModules } from "@/shell/modules";

export type SiteSettingsWithModules = SiteSettings & {
  enabledModuleIds: ReturnType<typeof normalizeModules>;
};

export async function getSiteSettings(): Promise<SiteSettingsWithModules> {
  const settings = await prisma.siteSettings.upsert({
    where: { id: "site" },
    update: {},
    create: {
      id: "site",
      enabledModules: defaultEnabledModules
    }
  });

  // Enablement now comes from ModuleInstallation records, seeded from (and falling back to) the legacy
  // SiteSettings.enabledModules JSON so the app keeps working whether or not the install table exists.
  const enabledModuleIds = await resolveEnabledModuleIds(normalizeModules(settings.enabledModules));

  return {
    ...settings,
    enabledModuleIds
  };
}
