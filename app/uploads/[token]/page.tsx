import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { getModule } from "@/shell/modules";
import { requestIsOpen } from "@/lib/uploads/validation";
import { UploadForm } from "../upload-form";
import styles from "../uploads.module.css";

export const metadata = { title: "Send your files | Admit One", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSiteSettings();
  if (!getModule("uploads") || !settings.enabledModuleIds.includes("uploads")) notFound();
  const request = await prisma.uploadRequest.findFirst({ where: { token, siteId: settings.siteId } });
  if (!request) notFound();
  return <main className={styles.portal}>
    <a href="https://admitonedesign.com" className={styles.brand}>Admit One</a>
    <p className="eyebrow">Client upload portal</p><h1>{request.title}</h1>
    {requestIsOpen(request) ? <>
      <p className={styles.intro}>Send the good stuff. Your photos, videos, and brand files arrive in their original quality.</p>
      <UploadForm token={token} />
      <p className={styles.note}>No resizing or compression. Only Admit One staff with upload access can retrieve your files. Send files you own or have permission to use.</p>
    </> : <p>This upload link has closed or expired. Contact Admit One for a new link.</p>}
  </main>;
}
