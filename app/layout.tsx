import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { PublicAnalyticsBootstrap } from "@/components/analytics/tracker";
import { getPublicAnalyticsConfig } from "@/lib/analytics/config";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showrunner",
  description: "A reusable client website and admin panel with native scheduling."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, settings] = await Promise.all([cookies(), getSiteSettings()]);
  const analytics = getPublicAnalyticsConfig(settings);
  const consent = cookieStore.get("sr_tracking_consent")?.value || "unset";

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {analytics.searchConsoleVerification ? (
          <meta name="google-site-verification" content={analytics.searchConsoleVerification} />
        ) : null}
      </head>
      <body style={themeToCssVars(settings)}>
        <PublicAnalyticsBootstrap
          consent={consent}
          ga4MeasurementId={analytics.ga4MeasurementId}
          googleAdsTagId={analytics.googleAdsTagId}
          metaPixelId={analytics.metaPixelId}
        />
        {children}
      </body>
    </html>
  );
}
