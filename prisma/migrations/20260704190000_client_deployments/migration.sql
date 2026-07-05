DO $$ BEGIN
  CREATE TYPE "ClientDeploymentStatus" AS ENUM ('READY', 'CLAIMED', 'EXPIRED', 'REVOKED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ClientDeployment" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "createdById" TEXT,
  "clientName" TEXT NOT NULL,
  "clientEmail" TEXT NOT NULL DEFAULT '',
  "repoOwner" TEXT NOT NULL DEFAULT '',
  "repoName" TEXT NOT NULL,
  "templateRepository" TEXT NOT NULL,
  "selectedModules" JSONB NOT NULL DEFAULT '[]',
  "moduleInclude" TEXT NOT NULL DEFAULT '',
  "inviteTokenHash" TEXT NOT NULL,
  "inviteTokenPreview" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "githubUsername" TEXT NOT NULL DEFAULT '',
  "githubRepositoryUrl" TEXT NOT NULL DEFAULT '',
  "status" "ClientDeploymentStatus" NOT NULL DEFAULT 'READY',
  "failureReason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientDeployment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientDeployment_inviteTokenHash_key" ON "ClientDeployment"("inviteTokenHash");
CREATE INDEX IF NOT EXISTS "ClientDeployment_siteId_createdAt_idx" ON "ClientDeployment"("siteId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClientDeployment_createdById_idx" ON "ClientDeployment"("createdById");
CREATE INDEX IF NOT EXISTS "ClientDeployment_status_expiresAt_idx" ON "ClientDeployment"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "ClientDeployment_clientEmail_idx" ON "ClientDeployment"("clientEmail");

DO $$ BEGIN
  ALTER TABLE "ClientDeployment" ADD CONSTRAINT "ClientDeployment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientDeployment" ADD CONSTRAINT "ClientDeployment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
