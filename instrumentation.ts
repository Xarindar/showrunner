export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startSquareMaintenance } = await import("./lib/payments/square-maintenance");
    startSquareMaintenance();
    const { startEmailOutbox } = await import("./lib/email/maintenance");
    startEmailOutbox();
    const { startBookingPaymentMaintenance } = await import("./lib/bookings/checkout-maintenance");
    startBookingPaymentMaintenance();
    const { startProofBundles } = await import("./lib/portfolio/proof-bundles");
    startProofBundles();
  }
}
