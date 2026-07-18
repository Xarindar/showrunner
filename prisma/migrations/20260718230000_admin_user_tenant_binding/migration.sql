INSERT INTO "Tenant" ("id", "slug", "name", "createdAt", "updatedAt")
VALUES ('default-tenant', 'default', 'Default tenant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "AdminUser" ADD COLUMN "tenantId" TEXT;

UPDATE "AdminUser"
SET "tenantId" = 'default-tenant'
WHERE "tenantId" IS NULL;

ALTER TABLE "AdminUser" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "AdminUser_tenantId_idx" ON "AdminUser"("tenantId");

ALTER TABLE "AdminUser"
ADD CONSTRAINT "AdminUser_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
