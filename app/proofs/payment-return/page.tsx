import type { Metadata } from "next";
import { ProofPaymentReturn } from "@/modules/portfolio/proof-payment-return";

export const metadata: Metadata = {
  title: "Return to your photo selection",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer"
};

export default function ProofPaymentReturnPage() {
  return <ProofPaymentReturn />;
}
