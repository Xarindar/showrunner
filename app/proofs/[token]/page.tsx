import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import Image from "next/image";
import { ButtonAnchor } from "@/components/ui/button";
import styles from "@/modules/portfolio/proof-client.module.css";
import { getClientSessionDelivery, getProofSelection } from "@/lib/portfolio/purchases";
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
      <header className={styles.header}><div><h1>{delivery.title}</h1>{delivery.description ? <p className={styles.description}>{delivery.description}</p> : null}<p className={styles.instructions}>Your session photos are ready. Keep this private link safe.</p></div></header>
      <section aria-label="Session photos" className={styles.downloads}>
        {!delivery.photos.length ? <p>No photos have been added yet. Please check back soon.</p> : null}
        <div className={styles.grid}>{delivery.photos.map(photo => <figure className={styles.photo} key={photo.id}>
          <a aria-label={`Open ${photo.name}`} href={photo.preview} rel="noreferrer" target="_blank"><Image alt={photo.name} height={300} src={photo.thumbnail} unoptimized width={400} /></a>
          <figcaption>{photo.name}</figcaption><ButtonAnchor download href={photo.download} referrerPolicy="no-referrer" size="sm" variant="secondary">Download<span className={styles.srOnly}> {photo.name}</span></ButtonAnchor>
        </figure>)}</div>
      </section>
    </main>;
  }
  return <ProofClient brand={{ name: settings.businessName, logoUrl: settings.logoImageUrl }} initialView={selection} token={token} />;
}
