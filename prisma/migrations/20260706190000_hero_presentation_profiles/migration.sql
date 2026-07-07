ALTER TABLE "HeroPresentation"
  ADD COLUMN "profileKey" TEXT NOT NULL DEFAULT 'cottage616';

DROP INDEX "HeroPresentation_siteId_key";

CREATE UNIQUE INDEX "HeroPresentation_siteId_profileKey_key" ON "HeroPresentation"("siteId", "profileKey");
