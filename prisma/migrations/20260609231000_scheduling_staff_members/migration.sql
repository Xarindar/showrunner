-- Add staff-aware scheduling while preserving existing site-wide availability.

CREATE TABLE "StaffMember" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "title" TEXT NOT NULL DEFAULT '',
  "bio" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceStaff" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceStaff_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AvailabilityRule" ADD COLUMN "staffId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "staffId" TEXT;

CREATE INDEX "StaffMember_siteId_isActive_idx" ON "StaffMember"("siteId", "isActive");
CREATE INDEX "StaffMember_siteId_email_idx" ON "StaffMember"("siteId", "email");
CREATE UNIQUE INDEX "ServiceStaff_serviceId_staffId_key" ON "ServiceStaff"("serviceId", "staffId");
CREATE INDEX "ServiceStaff_siteId_staffId_idx" ON "ServiceStaff"("siteId", "staffId");
CREATE INDEX "ServiceStaff_siteId_serviceId_idx" ON "ServiceStaff"("siteId", "serviceId");
CREATE INDEX "AvailabilityRule_siteId_staffId_idx" ON "AvailabilityRule"("siteId", "staffId");
CREATE INDEX "Booking_staffId_startsAt_idx" ON "Booking"("staffId", "startsAt");

ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
