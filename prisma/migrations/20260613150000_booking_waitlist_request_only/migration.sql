CREATE TYPE "BookingWaitlistStatus" AS ENUM ('WAITING', 'PROMOTED', 'DECLINED', 'CANCELED');

ALTER TYPE "AutomationTrigger" ADD VALUE 'BOOKING_REQUEST_APPROVED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'BOOKING_WAITLIST_JOINED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'BOOKING_WAITLIST_PROMOTED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'BOOKING_WAITLIST_DECLINED';

ALTER TABLE "Service"
  ADD COLUMN "requestOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "BookingWaitlistEntry" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "staffId" TEXT,
  "promotedBookingId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT,
  "notes" TEXT,
  "intakeResponse" TEXT,
  "policyAccepted" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "status" "BookingWaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingWaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingWaitlistEntry_siteId_status_startsAt_idx" ON "BookingWaitlistEntry"("siteId", "status", "startsAt");
CREATE INDEX "BookingWaitlistEntry_serviceId_startsAt_idx" ON "BookingWaitlistEntry"("serviceId", "startsAt");
CREATE INDEX "BookingWaitlistEntry_staffId_startsAt_idx" ON "BookingWaitlistEntry"("staffId", "startsAt");
CREATE INDEX "BookingWaitlistEntry_promotedBookingId_idx" ON "BookingWaitlistEntry"("promotedBookingId");

ALTER TABLE "BookingWaitlistEntry" ADD CONSTRAINT "BookingWaitlistEntry_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingWaitlistEntry" ADD CONSTRAINT "BookingWaitlistEntry_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingWaitlistEntry" ADD CONSTRAINT "BookingWaitlistEntry_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingWaitlistEntry" ADD CONSTRAINT "BookingWaitlistEntry_promotedBookingId_fkey"
  FOREIGN KEY ("promotedBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
