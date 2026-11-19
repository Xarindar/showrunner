ALTER TABLE "Booking" ADD COLUMN "publicSubmissionKeyHash" TEXT, ADD COLUMN "publicSubmissionFingerprint" TEXT;
CREATE UNIQUE INDEX "Booking_siteId_publicSubmissionKeyHash_key" ON "Booking" ("siteId", "publicSubmissionKeyHash");
