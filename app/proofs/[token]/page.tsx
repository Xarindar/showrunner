import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import Image from "next/image";
import styles from "@/modules/portfolio/proof-client.module.css";
import { getClientSessionDelivery, getProofSelection } from "@/lib/portfolio/purchases";
import { prisma } from "@/lib/prisma";
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
  if (!selection) {
    const delivery = await getClientSessionDelivery(token);
    if (!delivery) notFound();
    return <main className={styles.page}>
      <header className={styles.header}><div className={styles.brand}>{settings.logoImageUrl ? <Image alt={settings.businessName} height={70} width={280} src={settings.logoImageUrl} unoptimized referrerPolicy="no-referrer" /> : <span>{settings.businessName}</span>}</div></header>
      <section className={styles.downloads} aria-labelledby="gallery-setup-title"><h1 id="gallery-setup-title">{delivery.title}</h1><p>Your photographer is finishing your photo-selection options. Please check back soon.</p></section>
      <aside aria-label="Selection summary" className={styles.summary}><strong>Photo selection is being prepared</strong></aside>
    </main>;
  }
  const jazzr = await prisma.siteDomain.findFirst({ where: { siteId: settings.siteId, hostname: "admin.jazzrphotography.com" }, select: { id: true } });
  const client = jazzr && access.clientId && await prisma.client.findFirst({
    where: { id: access.clientId, siteId: settings.siteId }, select: { name: true }
  });
  const firstName = client ? client.name.trim().split(/\s+/)[0] : undefined;
  return <>{jazzr && <link rel="stylesheet" href="/proof-delivery/jazzr-fonts.css" />}
    <ProofClient brand={{ name: settings.businessName, logoUrl: settings.logoImageUrl, theme: jazzr ? "jazzr" : undefined, firstName }} initialView={selection} token={token} /></>;
}
