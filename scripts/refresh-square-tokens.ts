import "dotenv/config";
import { PaymentGatewayConnectionStatus, PaymentProvider } from "@prisma/client";
import {
  isOAuthSquareCredential,
  refreshSquareCredentialDirect,
  squareTokenRefreshedAt
} from "../lib/payments/connect/square-refresh";
import { prisma } from "../lib/prisma";

// Proactively rotate PKCE OAuth tokens directly with Square. This process shares
// Showrunner's code and database but runs as a separate daily Railway cron service.
// Connect is never contacted after the one-time browser handoff.

const refreshCadenceMs = 7 * 24 * 60 * 60 * 1000;
const staleAlertMs = 8 * 24 * 60 * 60 * 1000;

async function main() {
  const cadenceCutoff = new Date(Date.now() - refreshCadenceMs);
  const staleCutoff = new Date(Date.now() - staleAlertMs);
  const credentials = await prisma.paymentGatewayCredential.findMany({
    where: {
      provider: PaymentProvider.SQUARE,
      status: PaymentGatewayConnectionStatus.CONNECTED,
      encryptedRefreshToken: { not: "" }
    }
  });

  const oauthCredentials = credentials.filter(
    (credential) => {
      const refreshedAt = squareTokenRefreshedAt(credential);
      return isOAuthSquareCredential(credential) && (!refreshedAt || refreshedAt <= cadenceCutoff);
    }
  );
  let refreshed = 0;
  const failures: { error: string; siteId: string }[] = [];

  for (const credential of oauthCredentials) {
    try {
      const result = await refreshSquareCredentialDirect(credential);
      if (result) {
        refreshed += 1;
        console.log(`refreshed site=${credential.siteId} newExpiry=${result.expiresAt.toISOString()}`);
      }
    } catch (error) {
      failures.push({ error: error instanceof Error ? error.message : String(error), siteId: credential.siteId });
    }
  }

  const stale = credentials
    .filter((credential) => {
      const refreshedAt = squareTokenRefreshedAt(credential);
      return isOAuthSquareCredential(credential) && (!refreshedAt || refreshedAt <= staleCutoff);
    })
    .map((credential) => credential.siteId);

  console.log(JSON.stringify({ candidates: oauthCredentials.length, failures, refreshed, staleConnections: stale }));
  if (failures.length || stale.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
