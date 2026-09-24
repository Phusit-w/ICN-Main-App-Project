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
