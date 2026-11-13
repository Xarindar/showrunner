CREATE TYPE "EmailDeliveryProvider" AS ENUM ('SMTP', 'GOOGLE');
ALTER TABLE "EmailOutbox" ADD COLUMN "deliveryProvider" "EmailDeliveryProvider" NOT NULL DEFAULT 'SMTP';
CREATE TABLE "GoogleEmailConnection" (
  "siteId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "googleSubject" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "connectionError" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleEmailConnection_pkey" PRIMARY KEY ("siteId"),
  CONSTRAINT "GoogleEmailConnection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
