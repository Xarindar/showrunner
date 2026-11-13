ALTER TYPE "EmailDeliveryProvider" RENAME VALUE 'GOOGLE' TO 'CONNECTED';

CREATE TABLE "EmailProviderConnection" (
  "siteId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "replyToEmail" TEXT NOT NULL,
  "smtpHost" TEXT NOT NULL DEFAULT '',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "smtpUser" TEXT NOT NULL DEFAULT '',
  "encryptedSecret" TEXT NOT NULL,
  "connectionError" TEXT NOT NULL DEFAULT '',
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailProviderConnection_pkey" PRIMARY KEY ("siteId"),
  CONSTRAINT "EmailProviderConnection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Google OAuth email support has been removed; never fall back with its saved credentials.
DROP TABLE "GoogleEmailConnection";
