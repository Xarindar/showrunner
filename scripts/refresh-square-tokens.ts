import "dotenv/config";
import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import { isOAuthSquareCredential, refreshSquareCredentialViaBroker } from "../lib/payments/connect/square-refresh";
import { prisma } from "../lib/prisma";

// Proactively refresh OAuth-connected Square tokens via the AdmitOne Connect broker
// well before their ~30-day expiry, so charges never depend on a just-in-time refresh.
// Run on a schedule (e.g. daily): npm run payments:refresh-square

const refreshWithinMs = 14 * 24 * 60 * 60 * 1000;

async function main() {
  const cutoff = new Date(Date.now() + refreshWithinMs);
  const credentials = await prisma.paymentGatewayCredential.findMany({
    where: {
      provider: PaymentProvider.SQUARE,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      expiresAt: { not: null, lte: cutoff },
      encryptedRefreshToken: { not: "" }
    }
  });

  const oauthCredentials = credentials.filter((credential) => isOAuthSquareCredential(credential));
  let refreshed = 0;
  const failures: { error: string; siteId: string }[] = [];

  for (const credential of oauthCredentials) {
    try {
      const result = await refreshSquareCredentialViaBroker(credential);
      refreshed += 1;
      console.log(`refreshed site=${credential.siteId} newExpiry=${result.expiresAt.toISOString()}`);
    } catch (error) {
      failures.push({ error: error instanceof Error ? error.message : String(error), siteId: credential.siteId });
    }
  }

  console.log(JSON.stringify({ candidates: oauthCredentials.length, failures, refreshed }));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
