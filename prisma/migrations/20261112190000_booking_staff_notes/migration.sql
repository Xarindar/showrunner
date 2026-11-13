CREATE TABLE "BookingNote" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingNote_bookingId_createdAt_idx" ON "BookingNote"("bookingId", "createdAt");
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BookingNote" ("id", "bookingId", "content", "createdAt")
SELECT 'legacy-' || "id", "id", "adminNotes", "createdAt"
FROM "Booking" WHERE "adminNotes" IS NOT NULL AND LENGTH(TRIM("adminNotes")) > 0;
