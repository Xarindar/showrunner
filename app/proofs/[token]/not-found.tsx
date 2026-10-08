import styles from "@/modules/portfolio/proof-client.module.css";

export default function ProofNotFound() {
  return (
    <main className={styles.unavailable}>
      <h1>This proof link is unavailable</h1>
      <p>It may have expired or been replaced. Ask your photographer for a new private link.</p>
    </main>
  );
}
