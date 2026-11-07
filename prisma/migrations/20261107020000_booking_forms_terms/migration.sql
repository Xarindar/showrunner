ALTER TABLE "BookingRuleSet" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'INTAKE', ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
UPDATE "BookingRuleSet" SET "kind" = 'TERMS' WHERE jsonb_array_length("rules") > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("rules") rule WHERE rule->>'kind' <> 'policy');
CREATE UNIQUE INDEX "BookingRuleSet_site_default_kind" ON "BookingRuleSet" ("siteId", "kind") WHERE "isDefault" = true;
ALTER TABLE "Service" ADD COLUMN "bookingDocumentSelection" JSONB;
ALTER TABLE "Booking" ADD COLUMN "bookingRequirementsSnapshot" JSONB;
