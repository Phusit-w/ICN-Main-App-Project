-- AlterTable
ALTER TABLE "SocMajorItem" ADD COLUMN     "skipped" BOOLEAN NOT NULL DEFAULT false;

-- Jobs imported with a split item before this column: the same guess as a
-- new import (the items beside the split group are ไม่ต้องตรวจ), but only
-- on items nobody has asked to check yet.
UPDATE "SocMajorItem" AS m
SET "skipped" = true
WHERE m."groupLabel" IS NULL
  AND m."state" = 'not_checked'
  AND EXISTS (SELECT 1 FROM "SocMajorItem" AS g WHERE g."jobId" = m."jobId" AND g."groupLabel" IS NOT NULL);
