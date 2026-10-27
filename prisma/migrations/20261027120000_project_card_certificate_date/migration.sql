-- AlterTable
ALTER TABLE "ProjectCard" ADD COLUMN     "certificateDate" DATE,
ADD COLUMN     "certificateDateEditedByPerson" BOOLEAN NOT NULL DEFAULT false;
