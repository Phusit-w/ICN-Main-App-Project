
-- CreateTable
CREATE TABLE "SocCheckRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "majorItemId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'requested',
    "priorState" TEXT NOT NULL,
    "replaceConfirmed" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "acknowledgedMissing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claimedByLinkId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "skillPackageId" TEXT,
    "progressNote" TEXT,
    "resumeAt" TIMESTAMP(3),
    "missingDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failureReason" TEXT,
    "runId" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocCheckRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocCheckRequest_requestedById_state_createdAt_idx" ON "SocCheckRequest"("requestedById", "state", "createdAt");

-- CreateIndex
CREATE INDEX "SocCheckRequest_majorItemId_createdAt_idx" ON "SocCheckRequest"("majorItemId", "createdAt");

-- CreateIndex
CREATE INDEX "SocCheckRequest_state_lastSeenAt_idx" ON "SocCheckRequest"("state", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SocJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_majorItemId_fkey" FOREIGN KEY ("majorItemId") REFERENCES "SocMajorItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_claimedByLinkId_fkey" FOREIGN KEY ("claimedByLinkId") REFERENCES "SocRunnerLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_skillPackageId_fkey" FOREIGN KEY ("skillPackageId") REFERENCES "SocSkillPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

