import { Prisma, type SiteSettings } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveEnabledModuleIds } from "@/lib/modules/installation";
import { DEFAULT_SITE_ID, DEFAULT_SITE_NAME, DEFAULT_SITE_SLUG, DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "@/lib/site-boundary";
import { defaultEnabledModules, normalizeModules } from "@/shell/modules";

export type SiteSettingsWithModules = SiteSettings & {
  enabledModuleIds: ReturnType<typeof normalizeModules>;
};

function normalizeHostname(value: string) {
  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "");
}

function configuredDefaultHostname() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  try {
    return normalizeHostname(new URL(appUrl).hostname);
  } catch {
    return "";
  }
}

async function requestHostname() {
  try {
    const headerStore = await headers();
    return normalizeHostname(headerStore.get("x-forwarded-host") || headerStore.get("host") || "");
  } catch {
    return "";
  }
}

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

  const site = await prisma.site.upsert({
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

  const defaultHostname = configuredDefaultHostname();
  if (defaultHostname && defaultHostname !== "localhost") {
    await prisma.siteDomain.upsert({
      where: { hostname: defaultHostname },
      update: { siteId: site.id, isPrimary: true },
      create: {
        siteId: site.id,
        hostname: defaultHostname,
        isPrimary: true
      }
    });
  }

  return site;
}

export async function resolveCurrentSite() {
  const defaultSite = await ensureDefaultSite();
  const hostname = await requestHostname();

  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return defaultSite;

  const domain = await prisma.siteDomain.findUnique({
    where: { hostname },
    include: { site: true }
  });

  return domain?.site || defaultSite;
}

export async function getCurrentSiteId() {
  const site = await resolveCurrentSite();
  return site.id;
}

export async function getSiteSettingsForSite(siteId: string): Promise<SiteSettingsWithModules> {
  if (siteId === DEFAULT_SITE_ID) await ensureDefaultSite();
  let settings: SiteSettings;
  try {
    settings = await prisma.siteSettings.upsert({
      where: { siteId },
      update: {},
      create: {
        siteId,
        enabledModules: defaultEnabledModules
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const existingSettings = await prisma.siteSettings.findUnique({
      where: { siteId }
    });
    if (!existingSettings) throw error;
    settings = existingSettings;
  }

  // Enablement now comes from ModuleInstallation records, seeded from (and falling back to) the legacy
  // SiteSettings.enabledModules JSON so the app keeps working whether or not the install table exists.
  const enabledModuleIds = await resolveEnabledModuleIds(normalizeModules(settings.enabledModules), settings.siteId);

  return {
    ...settings,
    enabledModuleIds
  };
}

export async function getSiteSettings(): Promise<SiteSettingsWithModules> {
  const site = await resolveCurrentSite();
  return getSiteSettingsForSite(site.id);
}
