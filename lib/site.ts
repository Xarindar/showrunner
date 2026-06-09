import type { SiteSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEnabledModuleIds } from "@/lib/modules/installation";
import { DEFAULT_SITE_ID, DEFAULT_SITE_NAME, DEFAULT_SITE_SLUG, DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "@/lib/site-boundary";
import { defaultEnabledModules, normalizeModules } from "@/shell/modules";

export type SiteSettingsWithModules = SiteSettings & {
  enabledModuleIds: ReturnType<typeof normalizeModules>;
};

export async function ensureDefaultSite() {
  await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: {},
    create: {
      id: DEFAULT_TENANT_ID,
      slug: DEFAULT_TENANT_SLUG,
      name: "Default tenant"
    }
  });

  return prisma.site.upsert({
    where: { id: DEFAULT_SITE_ID },
    update: {},
    create: {
      id: DEFAULT_SITE_ID,
      tenantId: DEFAULT_TENANT_ID,
      slug: DEFAULT_SITE_SLUG,
      name: DEFAULT_SITE_NAME,
      isDefault: true
    }
  });
}

export async function getSiteSettings(): Promise<SiteSettingsWithModules> {
  await ensureDefaultSite();

  const settings = await prisma.siteSettings.upsert({
    where: { siteId: DEFAULT_SITE_ID },
    update: {},
    create: {
      id: DEFAULT_SITE_ID,
      siteId: DEFAULT_SITE_ID,
      enabledModules: defaultEnabledModules
    }
  });

  // Enablement now comes from ModuleInstallation records, seeded from (and falling back to) the legacy
  // SiteSettings.enabledModules JSON so the app keeps working whether or not the install table exists.
  const enabledModuleIds = await resolveEnabledModuleIds(normalizeModules(settings.enabledModules), settings.siteId);

  return {
    ...settings,
    enabledModuleIds
  };
}
