ALTER TABLE "Service" ADD COLUMN "bookingRules" JSONB;
CREATE TABLE "BookingRuleSet" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "rules" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingRuleSet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingRuleSet_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookingRuleSet_siteId_nameKey_key" ON "BookingRuleSet"("siteId", "nameKey");
