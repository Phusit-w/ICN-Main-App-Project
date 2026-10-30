-- DropIndex
DROP INDEX "SocDocument_storageKey_key";

-- AlterTable
ALTER TABLE "SocJob" ADD COLUMN "proposalId" TEXT,
ADD COLUMN "socVersionId" TEXT;

-- AlterTable
ALTER TABLE "ProposalDatasheet" ADD COLUMN "removedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SocDocument_storageKey_idx" ON "SocDocument"("storageKey");

-- CreateIndex
CREATE INDEX "SocJob_proposalId_idx" ON "SocJob"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "SocJob_socVersionId_key" ON "SocJob"("socVersionId");

-- AddForeignKey
ALTER TABLE "SocJob" ADD CONSTRAINT "SocJob_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocJob" ADD CONSTRAINT "SocJob_socVersionId_fkey" FOREIGN KEY ("socVersionId") REFERENCES "SocVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
