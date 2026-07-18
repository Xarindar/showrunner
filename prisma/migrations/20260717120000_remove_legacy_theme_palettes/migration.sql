-- Preserve the former palette's primary color, then enforce the single-color contract.
UPDATE "SiteSettings"
SET "themePrimary" = '#' || substring("themePrimary" from 9 for 6)
WHERE "themePrimary" ~* '^palette:[0-9a-f]{6}(?:-[0-9a-f]{6})*$';

UPDATE "SiteSettings"
SET "themePrimary" = '#116466'
WHERE "themePrimary" !~* '^#[0-9a-f]{6}$';

ALTER TABLE "SiteSettings"
ADD CONSTRAINT "SiteSettings_themePrimary_hex_check"
CHECK ("themePrimary" ~* '^#[0-9a-f]{6}$');
