import "server-only";
import { getSiteSettingsForSite } from "@/lib/site";
import { resolveContentManifest } from "@/clients/content-manifests";
export async function requireLegacyContentSite(siteId: string) {
  const settings = await getSiteSettingsForSite(siteId);
  if (!settings.enabledModuleIds.includes("content") || !resolveContentManifest(siteId, settings.publicContentConfig).legacyProfiles) throw new Error("This content editor is not configured for this site");
}
