CREATE TYPE "SchedulingCalendarProvider" AS ENUM ('GOOGLE');

CREATE TYPE "SchedulingCalendarOwnerType" AS ENUM ('SITE', 'STAFF');

CREATE TYPE "SchedulingCalendarConnectionStatus" AS ENUM ('CONNECTED', 'ERROR');

CREATE TABLE "SchedulingCalendarConnection" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "provider" "SchedulingCalendarProvider" NOT NULL,
  "ownerType" "SchedulingCalendarOwnerType" NOT NULL,
  "ownerId" TEXT NOT NULL DEFAULT '',
  "calendarId" TEXT NOT NULL DEFAULT 'primary',
  "displayName" TEXT NOT NULL DEFAULT '',
  "accountEmail" TEXT NOT NULL DEFAULT '',
  "status" "SchedulingCalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "encryptedAccessToken" TEXT NOT NULL DEFAULT '',
  "encryptedRefreshToken" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchedulingCalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchedulingCalendarConnection_siteId_provider_ownerType_ownerId_key"
  ON "SchedulingCalendarConnection"("siteId", "provider", "ownerType", "ownerId");

CREATE INDEX "SchedulingCalendarConnection_siteId_provider_status_idx"
  ON "SchedulingCalendarConnection"("siteId", "provider", "status");

CREATE INDEX "SchedulingCalendarConnection_ownerType_ownerId_idx"
  ON "SchedulingCalendarConnection"("ownerType", "ownerId");

ALTER TABLE "SchedulingCalendarConnection"
  ADD CONSTRAINT "SchedulingCalendarConnection_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
