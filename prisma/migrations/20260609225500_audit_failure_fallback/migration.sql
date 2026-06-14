CREATE TABLE IF NOT EXISTS "AuditLogFailure" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL DEFAULT '',
  "actorEmail" TEXT NOT NULL DEFAULT '',
  "error" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLogFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLogFailure_action_createdAt_idx" ON "AuditLogFailure"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLogFailure_targetType_targetId_idx" ON "AuditLogFailure"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AuditLogFailure_createdAt_idx" ON "AuditLogFailure"("createdAt");
