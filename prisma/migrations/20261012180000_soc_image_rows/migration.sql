-- Image Rows (soc-image-rows ticket 08): the Image Row count of each major
-- item, and an Image Row's kind, reading and unsure note on its result.
-- Additive: existing items count 0 and existing results keep nulls.
ALTER TABLE "SocMajorItem" ADD COLUMN "imageRowCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SocCheckResult" ADD COLUMN "imageKind" TEXT,
ADD COLUMN "imageReading" TEXT,
ADD COLUMN "imageUnsure" TEXT,
ADD COLUMN "referenceNote" TEXT;
