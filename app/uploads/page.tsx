import styles from "./uploads.module.css";

export const metadata = { title: "Send files | Admit One", robots: { index: false, follow: false } };

export default function UploadLanding() {
  return <main className={styles.portal}>
    <a href="https://admitonedesign.com" className={styles.brand}>Admit One</a>
    <p className="eyebrow">Client upload portal</p><h1>Send us your originals.</h1>
    <p className={styles.intro}>Use the private project upload link Admit One sent you. You can upload photos, videos, logos, and documents without resizing or compression.</p>
    <p>Need an upload link? <a href="https://admitonedesign.com/#contact">Contact Admit One</a> and tell us which project your files are for.</p>
  </main>;
}
