ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'active_order';

UPDATE "Client"
SET "status" = CASE
  WHEN "status" IN ('active', 'lead', 'vip') THEN 'active_order'
  WHEN "status" = 'inactive' THEN 'order_shipped'
  ELSE "status"
END
WHERE "status" IN ('active', 'lead', 'vip', 'inactive');
