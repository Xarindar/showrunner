-- §14b patch: durable admin-user to staff-profile ownership identity.
-- Backfills from the previous email convention once, then keeps the FK in sync
-- when staff profiles or admin users are created/edited.

ALTER TABLE "StaffMember" ADD COLUMN "adminUserId" TEXT;

UPDATE "StaffMember" staff
SET "adminUserId" = admin."id"
FROM "AdminUser" admin
WHERE staff."email" <> ''
  AND lower(staff."email") = lower(admin."email");

CREATE INDEX "StaffMember_adminUserId_idx" ON "StaffMember"("adminUserId");
CREATE UNIQUE INDEX "StaffMember_siteId_adminUserId_key" ON "StaffMember"("siteId", "adminUserId");

ALTER TABLE "StaffMember"
  ADD CONSTRAINT "StaffMember_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION sync_staff_member_admin_user_id()
RETURNS trigger AS $$
BEGIN
  IF NEW."email" IS NULL OR btrim(NEW."email") = '' THEN
    NEW."adminUserId" := NULL;
    RETURN NEW;
  END IF;

  SELECT "id"
  INTO NEW."adminUserId"
  FROM "AdminUser"
  WHERE lower("email") = lower(NEW."email")
  LIMIT 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StaffMember_sync_adminUserId"
BEFORE INSERT OR UPDATE OF "email" ON "StaffMember"
FOR EACH ROW
EXECUTE FUNCTION sync_staff_member_admin_user_id();

CREATE OR REPLACE FUNCTION sync_admin_user_staff_profiles()
RETURNS trigger AS $$
BEGIN
  UPDATE "StaffMember"
  SET "adminUserId" = NULL
  WHERE "adminUserId" = NEW."id"
    AND lower("email") <> lower(NEW."email");

  UPDATE "StaffMember"
  SET "adminUserId" = NEW."id"
  WHERE "email" <> ''
    AND lower("email") = lower(NEW."email");

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminUser_sync_staffProfiles"
AFTER INSERT OR UPDATE OF "email" ON "AdminUser"
FOR EACH ROW
EXECUTE FUNCTION sync_admin_user_staff_profiles();

UPDATE "PortfolioGalleryAccess" access
SET "clientId" = NULL
WHERE access."clientId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Client" client
    WHERE client."id" = access."clientId"
  );

CREATE INDEX "PortfolioGalleryAccess_clientId_idx" ON "PortfolioGalleryAccess"("clientId");

ALTER TABLE "PortfolioGalleryAccess"
  ADD CONSTRAINT "PortfolioGalleryAccess_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
