-- Client CRM expansion: richer profile fields, saved segments, pipeline stages, and files.

DO $$ BEGIN
  CREATE TYPE "ClientPipelineStage" AS ENUM ('INQUIRY', 'CONTACTED', 'PROPOSAL_SENT', 'BOOKED', 'COMPLETED', 'FOLLOW_UP', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "pipelineStage" "ClientPipelineStage" NOT NULL DEFAULT 'INQUIRY',
  ADD COLUMN IF NOT EXISTS "companyName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "familyName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "alternateEmails" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "alternatePhones" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pronouns" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "birthday" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "anniversary" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preferences" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "smsOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "photoUsageRelease" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "policyAcceptanceHistory" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "dataExportRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dataDeletionRequestedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ClientFile" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClientSegment" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "criteria" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Client_siteId_status_idx" ON "Client"("siteId", "status");
CREATE INDEX IF NOT EXISTS "Client_siteId_pipelineStage_idx" ON "Client"("siteId", "pipelineStage");
CREATE INDEX IF NOT EXISTS "ClientFile_siteId_clientId_idx" ON "ClientFile"("siteId", "clientId");
CREATE INDEX IF NOT EXISTS "ClientFile_category_idx" ON "ClientFile"("category");
CREATE INDEX IF NOT EXISTS "ClientFile_uploadedAt_idx" ON "ClientFile"("uploadedAt");
CREATE INDEX IF NOT EXISTS "ClientSegment_siteId_idx" ON "ClientSegment"("siteId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientSegment_siteId_key_key" ON "ClientSegment"("siteId", "key");

DO $$ BEGIN
  ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientSegment" ADD CONSTRAINT "ClientSegment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

INSERT INTO "ClientSegment" ("id", "siteId", "name", "key", "criteria", "createdAt", "updatedAt")
SELECT 'segment_' || s."id" || '_' || v.key, s."id", v.name, v.key, v.criteria::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Site" s
CROSS JOIN (
  VALUES
    ('leads', 'Leads', '{"status":"lead"}'),
    ('active-clients', 'Active clients', '{"status":"active"}'),
    ('vips', 'VIPs', '{"status":"vip"}'),
    ('past-due', 'Past due', '{"pastDue":true}'),
    ('upcoming-appointments', 'Upcoming appointment', '{"upcomingAppointment":true}'),
    ('recent-purchase', 'Recent purchase', '{"recentPurchaseDays":90}'),
    ('no-recent-activity', 'No recent activity', '{"noRecentActivityDays":180}')
) AS v(key, name, criteria)
ON CONFLICT ("siteId", "key") DO NOTHING;
