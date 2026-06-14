ALTER TABLE "MessageTemplate"
  ADD COLUMN IF NOT EXISTS "builderRenderer" TEXT NOT NULL DEFAULT 'first_party_v1',
  ADD COLUMN IF NOT EXISTS "sourceTemplateId" TEXT;

CREATE TABLE IF NOT EXISTS "MessageTemplateVersion" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT '',
  "previewText" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL DEFAULT '',
  "textBody" TEXT NOT NULL DEFAULT '',
  "builderJson" JSONB NOT NULL DEFAULT '{}',
  "builderRenderer" TEXT NOT NULL DEFAULT 'first_party_v1',
  "tokens" JSONB NOT NULL DEFAULT '[]',
  "requiredTokens" JSONB NOT NULL DEFAULT '[]',
  "optionalTokens" JSONB NOT NULL DEFAULT '[]',
  "senderIdentityId" TEXT,
  "isMarketing" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MessageTemplate_sourceTemplateId_idx" ON "MessageTemplate"("sourceTemplateId");
CREATE UNIQUE INDEX IF NOT EXISTS "MessageTemplateVersion_templateId_version_key" ON "MessageTemplateVersion"("templateId", "version");
CREATE INDEX IF NOT EXISTS "MessageTemplateVersion_siteId_templateId_idx" ON "MessageTemplateVersion"("siteId", "templateId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageTemplate_sourceTemplateId_fkey'
  ) THEN
    ALTER TABLE "MessageTemplate"
      ADD CONSTRAINT "MessageTemplate_sourceTemplateId_fkey"
      FOREIGN KEY ("sourceTemplateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageTemplateVersion_templateId_fkey'
  ) THEN
    ALTER TABLE "MessageTemplateVersion"
      ADD CONSTRAINT "MessageTemplateVersion_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
