-- Reconcile migrations with the schema.
-- Migration 20260607170000_gallery_events_media_lifecycle added MediaAsset.updatedAt with a
-- DEFAULT CURRENT_TIMESTAMP backfill but never dropped the default. The schema models this column as
-- Prisma-managed @updatedAt (no database default), so deploying all migrations from empty produced a
-- column that drifted from the schema. Drop the leftover default to bring the two back in line.
ALTER TABLE "MediaAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;
