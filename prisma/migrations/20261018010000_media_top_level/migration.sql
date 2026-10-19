-- Promote Media out of Website while preserving the order of other modules.
UPDATE "AdminModuleNavigationItem" AS media
SET "category" = 'PRIMARY',
    "sortOrder" = COALESCE((
      SELECT MAX(item."sortOrder") + 1
      FROM "AdminModuleNavigationItem" AS item
      WHERE item."userId" = media."userId" AND item."category" = 'PRIMARY'
    ), 0),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE media."moduleId" = 'media' AND media."category" = 'WEBSITE';
