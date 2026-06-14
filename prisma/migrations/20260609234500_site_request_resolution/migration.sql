-- SiteSettings must be one row per site, not one hardcoded row id shared by all sites.
ALTER TABLE "SiteSettings" ALTER COLUMN "id" DROP DEFAULT;

-- Subscriber unsubscribe tokens are site-owned. Keep links unique per site so cloned sites can safely
-- generate their own token namespace while request-domain routing scopes lookups to the active site.
DROP INDEX IF EXISTS "EmailSubscriber_unsubscribeToken_key";
CREATE UNIQUE INDEX "EmailSubscriber_siteId_unsubscribeToken_key" ON "EmailSubscriber"("siteId", "unsubscribeToken");
