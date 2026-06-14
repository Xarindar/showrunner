-- Seed an initial open proofing round for galleries that already had proofing enabled.
INSERT INTO "PortfolioProofRound" (
  "id",
  "siteId",
  "galleryId",
  "roundNumber",
  "title",
  "status",
  "openedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'proof_round_' || g."id",
  g."siteId",
  g."id",
  1,
  'Round 1',
  'OPEN',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PortfolioGallery" g
WHERE g."proofingEnabled" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "PortfolioProofRound" r
    WHERE r."galleryId" = g."id"
  );
