ALTER TYPE "ProductType" ADD VALUE 'GIFT_CARD';

ALTER TABLE "CartItem"
  ADD COLUMN "giftCardRecipientName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "giftCardRecipientEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "giftCardMessage" TEXT NOT NULL DEFAULT '';

ALTER TABLE "OrderItem"
  ADD COLUMN "giftCardRecipientName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "giftCardRecipientEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "giftCardMessage" TEXT NOT NULL DEFAULT '';

ALTER TABLE "GiftCard"
  ADD COLUMN "saleOrderItemId" TEXT;

CREATE UNIQUE INDEX "GiftCard_saleOrderItemId_key" ON "GiftCard"("saleOrderItemId");

ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_saleOrderItemId_fkey" FOREIGN KEY ("saleOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
