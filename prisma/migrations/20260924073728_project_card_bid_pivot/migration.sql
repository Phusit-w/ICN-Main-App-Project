-- The old archive-crawl cards are replaced wholesale by the _BID cards, not
-- migrated: they have no Project Code, and "projectCode" below is NOT NULL.
-- deploy/windows/update.ps1 takes a pg_dump before migrating, so they stay
-- recoverable from that backup.
DELETE FROM "ProjectCard";

-- DropIndex
DROP INDEX "ProjectCard_folderPath_key";

-- AlterTable
ALTER TABLE "ProjectCard" DROP COLUMN "folderPath",
ADD COLUMN     "budgetNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "budgetSource" TEXT,
ADD COLUMN     "certificatePath" TEXT,
ADD COLUMN     "contractPath" TEXT,
ADD COLUMN     "projectCode" TEXT NOT NULL,
ADD COLUMN     "vatStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCard_projectCode_key" ON "ProjectCard"("projectCode");
