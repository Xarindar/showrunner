CREATE TYPE "ServicePricingType" AS ENUM ('FLAT_RATE', 'HOURLY');
CREATE TABLE "HourlyRate" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" BETWEEN 0 AND 999999999),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HourlyRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HourlyRate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HourlyRate_siteId_name_key" ON "HourlyRate"("siteId", "name");
ALTER TABLE "Service" ADD COLUMN "pricingType" "ServicePricingType" NOT NULL DEFAULT 'FLAT_RATE', ADD COLUMN "hourlyRateId" TEXT;
ALTER TABLE "ServiceLibraryItem" ADD COLUMN "pricingType" "ServicePricingType" NOT NULL DEFAULT 'FLAT_RATE', ADD COLUMN "hourlyRateId" TEXT, ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "Service" ADD CONSTRAINT "Service_hourlyRateId_fkey" FOREIGN KEY ("hourlyRateId") REFERENCES "HourlyRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceLibraryItem" ADD CONSTRAINT "ServiceLibraryItem_hourlyRateId_fkey" FOREIGN KEY ("hourlyRateId") REFERENCES "HourlyRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
