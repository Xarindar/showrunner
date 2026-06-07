import type { SiteSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

  return {
    ...settings,
    enabledModuleIds: normalizeModules(settings.enabledModules)
  };
}
