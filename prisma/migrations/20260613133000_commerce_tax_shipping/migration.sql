ALTER TABLE "SiteSettings"
  ADD COLUMN "commerceTaxEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commerceTaxLabel" TEXT NOT NULL DEFAULT 'Sales tax',
  ADD COLUMN "commerceTaxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commerceTaxAppliesToShipping" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commerceShippingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commerceShippingLabel" TEXT NOT NULL DEFAULT 'Standard shipping',
  ADD COLUMN "commerceShippingFlatCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commerceFreeShippingThresholdCents" INTEGER;

ALTER TABLE "Cart"
  ADD COLUMN "taxCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shippingCents" INTEGER NOT NULL DEFAULT 0;
