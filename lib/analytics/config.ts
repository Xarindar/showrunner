import type { SiteSettings } from "@prisma/client";

const defaultAnalyticsRetentionDays = 365;

const ga4MeasurementIdPattern = /^G-[A-Z0-9]{1,16}$/i;
const googleAdsTagIdPattern = /^(AW|GTM)-[A-Z0-9]{1,16}$/i;
const metaPixelIdPattern = /^[0-9]{1,32}$/;

function cleanIdentifier(value: string, maxLength = 128) {
  return value.trim().slice(0, maxLength);
}

function matchIdentifier(value: string, pattern: RegExp) {
  const trimmed = value.trim();
  return pattern.test(trimmed) ? trimmed : "";
}

export function normalizeAnalyticsRetentionDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) return defaultAnalyticsRetentionDays;
  return Math.min(3650, Math.max(30, Math.trunc(value ?? defaultAnalyticsRetentionDays)));
}

export function getPublicAnalyticsConfig(
  settings: Pick<
    SiteSettings,
    "ga4MeasurementId" | "googleAdsTagId" | "metaPixelId" | "searchConsoleVerification" | "analyticsRetentionDays"
  >
) {
  return {
    analyticsRetentionDays: normalizeAnalyticsRetentionDays(settings.analyticsRetentionDays),
    ga4MeasurementId: matchIdentifier(settings.ga4MeasurementId, ga4MeasurementIdPattern),
    googleAdsTagId: matchIdentifier(settings.googleAdsTagId, googleAdsTagIdPattern),
    metaPixelId: matchIdentifier(settings.metaPixelId, metaPixelIdPattern),
    searchConsoleVerification: cleanIdentifier(settings.searchConsoleVerification, 256)
  };
}
