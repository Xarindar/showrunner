ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'UPDATE_STATUS';
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'ADD_TAG';
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'CREATE_TASK';

ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

DO $$ BEGIN
  CREATE TYPE "AutomationTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Automation"
  ADD COLUMN IF NOT EXISTS "messageTemplateId" TEXT,
  ADD COLUMN IF NOT EXISTS "actionConfig" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "AutomationRun"
  ADD COLUMN IF NOT EXISTS "payload" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "replayOfRunId" TEXT;

CREATE TABLE IF NOT EXISTS "AutomationTask" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "automationRunId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "AutomationTaskStatus" NOT NULL DEFAULT 'OPEN',
  "actorEmail" TEXT NOT NULL DEFAULT '',
  "assignedToEmail" TEXT NOT NULL DEFAULT '',
  "relatedType" TEXT NOT NULL DEFAULT '',
  "relatedId" TEXT NOT NULL DEFAULT '',
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClientTag" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'automation',
  "relatedType" TEXT NOT NULL DEFAULT '',
  "relatedId" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Automation_messageTemplateId_idx" ON "Automation"("messageTemplateId");
CREATE INDEX IF NOT EXISTS "AutomationRun_status_nextAttemptAt_idx" ON "AutomationRun"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "AutomationRun_replayOfRunId_idx" ON "AutomationRun"("replayOfRunId");
CREATE INDEX IF NOT EXISTS "AutomationTask_siteId_status_idx" ON "AutomationTask"("siteId", "status");
CREATE INDEX IF NOT EXISTS "AutomationTask_automationRunId_idx" ON "AutomationTask"("automationRunId");
CREATE INDEX IF NOT EXISTS "AutomationTask_relatedType_relatedId_idx" ON "AutomationTask"("relatedType", "relatedId");
CREATE INDEX IF NOT EXISTS "AutomationTask_assignedToEmail_idx" ON "AutomationTask"("assignedToEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientTag_clientId_label_key" ON "ClientTag"("clientId", "label");
CREATE INDEX IF NOT EXISTS "ClientTag_siteId_label_idx" ON "ClientTag"("siteId", "label");
CREATE INDEX IF NOT EXISTS "ClientTag_relatedType_relatedId_idx" ON "ClientTag"("relatedType", "relatedId");

DO $$ BEGIN
  ALTER TABLE "Automation" ADD CONSTRAINT "Automation_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_replayOfRunId_fkey" FOREIGN KEY ("replayOfRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AutomationTask" ADD CONSTRAINT "AutomationTask_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AutomationTask" ADD CONSTRAINT "AutomationTask_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
