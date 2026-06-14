ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'GALLERY_CHANGES_REQUESTED';

CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioProofItemDecision_roundId_itemId_accessId_key"
  ON "PortfolioProofItemDecision"("roundId", "itemId", "accessId");
