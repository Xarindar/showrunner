CREATE TABLE "SiteApiKey" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "publicKey" TEXT NOT NULL,
  "allowedOrigins" JSONB NOT NULL DEFAULT '[]',
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "embedTheme" JSONB NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SiteApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteApiKey_publicKey_key" ON "SiteApiKey"("publicKey");
CREATE INDEX "SiteApiKey_siteId_idx" ON "SiteApiKey"("siteId");
CREATE INDEX "SiteApiKey_enabled_idx" ON "SiteApiKey"("enabled");

ALTER TABLE "SiteApiKey"
  ADD CONSTRAINT "SiteApiKey_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
