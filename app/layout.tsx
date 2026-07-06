import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import "@react-email/editor/themes/default.css";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Showrunner",
  description: "A modular admin workspace for Showrunner operations."
};

function isProductionBuild() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

async function layoutThemeVars() {
  if (isProductionBuild()) return undefined;
  const settings = await getSiteSettings();
  return themeToCssVars(settings);
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeVars = await layoutThemeVars();

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body style={themeVars}>
        {children}
      </body>
    </html>
  );
}
