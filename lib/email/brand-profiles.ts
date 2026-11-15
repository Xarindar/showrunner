import { resolveContentManifest } from "@/clients/content-manifests";

type SiteBrand = { siteId: string; publicContentConfig: unknown; businessName: string };

export function emailBrandProfiles(settings: SiteBrand) {
  const booking = resolveContentManifest(settings.siteId, settings.publicContentConfig).booking;
  const profiles = Object.entries(booking?.profileLabels || {}).map(([key, name]) => ({ key, name }));
  return profiles.length ? profiles : [{ key: "default", name: settings.businessName }];
}

export function emailBrandProfile(settings: SiteBrand, categorySlug?: string) {
  const booking = resolveContentManifest(settings.siteId, settings.publicContentConfig).booking;
  const profiles = emailBrandProfiles(settings);
  const key = categorySlug && booking?.profilesByCategory?.[categorySlug];
  return profiles.find(profile => profile.key === key) ||
    profiles.find(profile => profile.key === booking?.defaultProfile) || profiles[0];
}
