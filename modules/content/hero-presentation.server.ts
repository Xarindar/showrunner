import type { SiteSettingsWithModules } from "@/lib/site";
import {
  getHeroPresentationForProfilePayload,
  normalizeContentProfileKey,
  type ContentProfileKey
} from "./content-profiles";

export async function getHeroPresentationForProfile(
  siteId: string,
  profileKey: ContentProfileKey,
  settings: SiteSettingsWithModules
) {
  return getHeroPresentationForProfilePayload(siteId, profileKey, settings);
}

export async function getHeroPresentationForSite(siteId: string, settings: SiteSettingsWithModules, profileKey?: string | null) {
  return getHeroPresentationForProfilePayload(siteId, normalizeContentProfileKey(profileKey), settings);
}
