-- AlterTable
ALTER TABLE "ProjectCard" ADD COLUMN     "workTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
