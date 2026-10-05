-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appAccess" TEXT[] DEFAULT ARRAY['expense', 'soc', 'project-card-edit']::TEXT[];
