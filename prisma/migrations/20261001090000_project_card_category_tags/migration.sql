-- AlterTable
ALTER TABLE "ProjectCard" ADD COLUMN     "category" TEXT,
ADD COLUMN     "classificationEditedByPerson" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "ProjectCard_category_idx" ON "ProjectCard"("category");
