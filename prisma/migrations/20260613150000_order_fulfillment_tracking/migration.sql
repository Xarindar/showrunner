ALTER TYPE "AutomationTrigger" ADD VALUE 'ORDER_FULFILLED';

ALTER TABLE "Order"
  ADD COLUMN "fulfilledAt" TIMESTAMP(3),
  ADD COLUMN "fulfillmentCarrier" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "fulfillmentTrackingNumber" TEXT NOT NULL DEFAULT '';
