CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "GiftCard" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "initialAmountCents" INTEGER NOT NULL,
  "balanceCents" INTEGER NOT NULL,
  "recipientName" TEXT NOT NULL DEFAULT '',
  "recipientEmail" TEXT NOT NULL DEFAULT '',
  "purchaserName" TEXT NOT NULL DEFAULT '',
  "purchaserEmail" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCardRedemption" (
  "id" TEXT NOT NULL,
  "giftCardId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "codeSnapshot" TEXT NOT NULL,
  "restoredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftCardRedemption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Cart"
  ADD COLUMN "giftCardCreditCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "giftCardId" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "giftCardCreditCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "giftCardId" TEXT;

CREATE UNIQUE INDEX "GiftCard_siteId_code_key" ON "GiftCard"("siteId", "code");
CREATE INDEX "GiftCard_siteId_status_idx" ON "GiftCard"("siteId", "status");
CREATE INDEX "GiftCard_recipientEmail_idx" ON "GiftCard"("recipientEmail");
CREATE INDEX "GiftCardRedemption_giftCardId_idx" ON "GiftCardRedemption"("giftCardId");
CREATE INDEX "GiftCardRedemption_orderId_idx" ON "GiftCardRedemption"("orderId");
CREATE INDEX "GiftCardRedemption_restoredAt_idx" ON "GiftCardRedemption"("restoredAt");

ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
