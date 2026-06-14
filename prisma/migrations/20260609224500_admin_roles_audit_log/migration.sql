DO $$ BEGIN
  CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'PHOTOGRAPHER', 'FULFILLMENT', 'ACCOUNTANT', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "AdminUser"
  ADD COLUMN IF NOT EXISTS "role_v2" "AdminRole" NOT NULL DEFAULT 'ADMIN';

UPDATE "AdminUser"
SET "role_v2" = CASE lower("role"::text)
  WHEN 'owner' THEN 'OWNER'::"AdminRole"
  WHEN 'admin' THEN 'ADMIN'::"AdminRole"
  WHEN 'staff' THEN 'STAFF'::"AdminRole"
  WHEN 'photographer' THEN 'PHOTOGRAPHER'::"AdminRole"
  WHEN 'fulfillment' THEN 'FULFILLMENT'::"AdminRole"
  WHEN 'accountant' THEN 'ACCOUNTANT'::"AdminRole"
  WHEN 'viewer' THEN 'VIEWER'::"AdminRole"
  ELSE 'ADMIN'::"AdminRole"
END;

ALTER TABLE "AdminUser" DROP COLUMN "role";
ALTER TABLE "AdminUser" RENAME COLUMN "role_v2" TO "role";

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "siteId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL DEFAULT '',
  "actorRole" "AdminRole",
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL DEFAULT '',
  "targetLabel" TEXT NOT NULL DEFAULT '',
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_siteId_createdAt_idx" ON "AuditLog"("siteId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
