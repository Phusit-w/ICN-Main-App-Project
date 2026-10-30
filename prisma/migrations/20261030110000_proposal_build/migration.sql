-- AlterTable
ALTER TABLE "SocBuild" ADD COLUMN "proposalId" TEXT;

-- AlterTable
ALTER TABLE "SocVersion" ADD COLUMN "buildId" TEXT;

-- CreateIndex
CREATE INDEX "SocBuild_proposalId_idx" ON "SocBuild"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "SocVersion_buildId_key" ON "SocVersion"("buildId");

-- AddForeignKey
ALTER TABLE "SocBuild" ADD CONSTRAINT "SocBuild_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocVersion" ADD CONSTRAINT "SocVersion_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "SocBuild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
