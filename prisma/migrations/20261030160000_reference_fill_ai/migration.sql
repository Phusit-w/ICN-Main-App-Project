-- AlterTable
ALTER TABLE "SocCheckRequest" ADD COLUMN     "majorItemKey" TEXT,
ADD COLUMN     "referenceFillRunId" TEXT;

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_referenceFillRunId_fkey" FOREIGN KEY ("referenceFillRunId") REFERENCES "ReferenceFillRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
