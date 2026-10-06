-- AlterTable
ALTER TABLE "SocCheckResult" ADD COLUMN     "declaredStatus" TEXT,
ADD COLUMN     "declaredStatusCheck" TEXT,
ADD COLUMN     "evidenceDetail" TEXT,
ADD COLUMN     "evidenceSupport" TEXT,
ADD COLUMN     "highlightCheck" TEXT,
ADD COLUMN     "highlightEvidence" TEXT,
ADD COLUMN     "itemLabelCheck" TEXT,
ADD COLUMN     "keyIssue" TEXT,
ADD COLUMN     "majorItemId" TEXT,
ADD COLUMN     "rawResult" JSONB,
ADD COLUMN     "referenceDetail" TEXT,
ADD COLUMN     "runId" TEXT,
ADD COLUMN     "torClaimResults" JSONB,
ADD COLUMN     "torDecision" TEXT,
ADD COLUMN     "torDecisionBasis" TEXT,
ADD COLUMN     "torThreshold" TEXT,
ADD COLUMN     "verifiedValue" TEXT;

-- AlterTable
ALTER TABLE "SocMajorItem" ADD COLUMN     "runSource" TEXT;

-- CreateTable
CREATE TABLE "SocCheckRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "majorItemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "skillVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocCheckRun_majorItemId_createdAt_idx" ON "SocCheckRun"("majorItemId", "createdAt");

-- CreateIndex
CREATE INDEX "SocCheckResult_majorItemId_idx" ON "SocCheckResult"("majorItemId");

-- AddForeignKey
ALTER TABLE "SocCheckRun" ADD CONSTRAINT "SocCheckRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SocJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckRun" ADD CONSTRAINT "SocCheckRun_majorItemId_fkey" FOREIGN KEY ("majorItemId") REFERENCES "SocMajorItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckRun" ADD CONSTRAINT "SocCheckRun_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckResult" ADD CONSTRAINT "SocCheckResult_majorItemId_fkey" FOREIGN KEY ("majorItemId") REFERENCES "SocMajorItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckResult" ADD CONSTRAINT "SocCheckResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SocCheckRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "SocCheckRun" ADD CONSTRAINT "SocCheckRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SocDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
