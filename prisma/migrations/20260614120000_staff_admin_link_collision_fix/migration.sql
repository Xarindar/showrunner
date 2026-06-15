-- §14b follow-up: prevent the email-sync triggers from violating
-- StaffMember_siteId_adminUserId_key when two staff profiles in the
-- same site share an email that matches one AdminUser.

CREATE OR REPLACE FUNCTION sync_staff_member_admin_user_id()
RETURNS trigger AS $$
DECLARE
  matched_admin_id TEXT;
BEGIN
  IF NEW."email" IS NULL OR btrim(NEW."email") = '' THEN
    NEW."adminUserId" := NULL;
    RETURN NEW;
  END IF;

  SELECT "id"
  INTO matched_admin_id
  FROM "AdminUser"
  WHERE lower("email") = lower(NEW."email")
  LIMIT 1;

  IF matched_admin_id IS NULL THEN
    NEW."adminUserId" := NULL;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "StaffMember"
    WHERE "siteId" = NEW."siteId"
      AND "adminUserId" = matched_admin_id
      AND "id" <> NEW."id"
  ) THEN
    NEW."adminUserId" := NULL;
  ELSE
    NEW."adminUserId" := matched_admin_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_admin_user_staff_profiles()
RETURNS trigger AS $$
BEGIN
  UPDATE "StaffMember"
  SET "adminUserId" = NULL
  WHERE "adminUserId" = NEW."id"
    AND lower("email") <> lower(NEW."email");

  UPDATE "StaffMember" sm
  SET "adminUserId" = NEW."id"
  FROM (
    SELECT DISTINCT ON ("siteId") "id"
    FROM "StaffMember"
    WHERE "email" <> ''
      AND lower("email") = lower(NEW."email")
    ORDER BY "siteId", "createdAt" ASC, "id" ASC
  ) picked
  WHERE sm."id" = picked."id"
    AND sm."adminUserId" IS DISTINCT FROM NEW."id";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
