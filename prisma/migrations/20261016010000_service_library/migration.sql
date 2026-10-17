CREATE TABLE "ServiceLibraryItem" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceLibraryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceLibraryItem_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServiceLibraryItem_siteId_nameKey_key" ON "ServiceLibraryItem"("siteId", "nameKey");
CREATE INDEX "ServiceLibraryItem_siteId_category_idx" ON "ServiceLibraryItem"("siteId", "category");

-- Preserve existing session parts as reusable services without rewriting package references.
INSERT INTO "ServiceLibraryItem" ("id", "siteId", "name", "nameKey", "updatedAt")
SELECT DISTINCT ON (s."siteId", lower(btrim(item->>'name')))
  'sli_' || md5(s."siteId" || ':' || lower(btrim(item->>'name'))),
  s."siteId", btrim(item->>'name'), lower(btrim(item->>'name')), CURRENT_TIMESTAMP
FROM "Service" s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s."sessionOffering"->'coverageItems') = 'array'
    THEN s."sessionOffering"->'coverageItems' ELSE '[]'::jsonb END
) item
WHERE jsonb_typeof(item->'name') = 'string' AND length(btrim(item->>'name')) BETWEEN 1 AND 120
ORDER BY s."siteId", lower(btrim(item->>'name')), s."id";
