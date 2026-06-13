ALTER TABLE "BookingReminder"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "BookingReminder_siteId_status_attemptCount_idx"
  ON "BookingReminder"("siteId", "status", "attemptCount");
