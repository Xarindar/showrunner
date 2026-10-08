"use client";

import { useEffect } from "react";
import styles from "./proof-client.module.css";

export function ProofPaymentReturn() {
  useEffect(() => {
    try {
      const path = sessionStorage.getItem("portfolio:proof-return");
      if (path && /^\/proofs\/[A-Za-z0-9_-]+$/.test(path) && path !== "/proofs/payment-return") {
        sessionStorage.removeItem("portfolio:proof-return");
        window.location.replace(path);
      }
    } catch { /* A private browser session may not allow sessionStorage. */ }
  }, []);

  return (
    <main className={styles.unavailable}>
      <h1>Return to your photo selection</h1>
      <p>If your gallery doesn’t open automatically, reopen the private proof link your photographer sent you.</p>
      <p>Your gallery checks payment with the provider before making original downloads available.</p>
    </main>
  );
}
