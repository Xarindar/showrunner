ALTER TABLE "Testimonial"
ADD COLUMN "permissionText" TEXT NOT NULL DEFAULT '',
ADD COLUMN "permissionGrantedAt" TIMESTAMP(3);

UPDATE "Testimonial"
SET "permissionGrantedAt" = "submittedAt",
    "permissionText" = 'Permission was recorded before consent text snapshots were available.'
WHERE "permissionGranted" = true
  AND "permissionGrantedAt" IS NULL;
