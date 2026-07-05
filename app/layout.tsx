import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import "@react-email/editor/themes/default.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showrunner",
  description: "A modular admin workspace for Showrunner operations."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body style={themeToCssVars(settings)}>
        {children}
      </body>
    </html>
  );
}
