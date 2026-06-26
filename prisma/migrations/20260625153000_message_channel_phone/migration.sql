ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'PHONE';

CREATE INDEX IF NOT EXISTS "MessageLog_recipientPhone_idx" ON "MessageLog"("recipientPhone");
