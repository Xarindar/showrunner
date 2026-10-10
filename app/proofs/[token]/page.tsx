import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import { getProofSelection } from "@/lib/portfolio/purchases";
import { getSiteSettings } from "@/lib/site";
import { ProofClient } from "@/modules/portfolio/proof-client";
import { proofTokenSchema } from "@/modules/portfolio/api/proof-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your photo selection",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer"
};

export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!proofTokenSchema.safeParse(token).success) notFound();
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) notFound();
  const access = await findActiveGalleryAccess(token, undefined, settings.siteId);
  if (!access) notFound();
  const selection = await getProofSelection(token);
  if (!selection) notFound();
  return <ProofClient initialView={selection} token={token} />;
}
