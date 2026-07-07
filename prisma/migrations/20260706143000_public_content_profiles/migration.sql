ALTER TABLE "SiteSettings"
  ADD COLUMN "publicContentConfig" JSONB NOT NULL DEFAULT '{}';

UPDATE "SiteApiKey"
SET "scopes" = "scopes" || '["content:read"]'::jsonb
WHERE jsonb_typeof("scopes") = 'array'
  AND "scopes" ? 'scheduling:read'
  AND NOT "scopes" ? 'content:read';
