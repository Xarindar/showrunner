-- Add bookable resources to the native scheduling path.

CREATE TABLE "Resource" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'ROOM',
  "description" TEXT NOT NULL DEFAULT '',
  "location" TEXT NOT NULL DEFAULT '',
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceResource" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingResource" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BookingResource_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AvailabilityRule" ADD COLUMN "resourceId" TEXT;
ALTER TABLE "BlockedTime" ADD COLUMN "resourceId" TEXT;

CREATE INDEX "Resource_siteId_isActive_idx" ON "Resource"("siteId", "isActive");
CREATE INDEX "Resource_siteId_type_idx" ON "Resource"("siteId", "type");
CREATE UNIQUE INDEX "ServiceResource_serviceId_resourceId_key" ON "ServiceResource"("serviceId", "resourceId");
CREATE INDEX "ServiceResource_siteId_resourceId_idx" ON "ServiceResource"("siteId", "resourceId");
CREATE INDEX "ServiceResource_siteId_serviceId_idx" ON "ServiceResource"("siteId", "serviceId");
CREATE UNIQUE INDEX "BookingResource_bookingId_resourceId_key" ON "BookingResource"("bookingId", "resourceId");
CREATE INDEX "BookingResource_siteId_resourceId_idx" ON "BookingResource"("siteId", "resourceId");
CREATE INDEX "BookingResource_siteId_bookingId_idx" ON "BookingResource"("siteId", "bookingId");
CREATE INDEX "AvailabilityRule_siteId_resourceId_idx" ON "AvailabilityRule"("siteId", "resourceId");
CREATE INDEX "BlockedTime_siteId_resourceId_idx" ON "BlockedTime"("siteId", "resourceId");

ALTER TABLE "Resource" ADD CONSTRAINT "Resource_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceResource" ADD CONSTRAINT "ServiceResource_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceResource" ADD CONSTRAINT "ServiceResource_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceResource" ADD CONSTRAINT "ServiceResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockedTime" ADD CONSTRAINT "BlockedTime_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
