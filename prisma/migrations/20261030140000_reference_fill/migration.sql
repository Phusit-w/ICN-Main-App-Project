-- CreateTable
CREATE TABLE "ReferenceFillRun" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suggestions" JSONB NOT NULL,

    CONSTRAINT "ReferenceFillRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceFillDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "choice" INTEGER,
    "datasheetId" TEXT,
    "pages" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceFillDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenceFillRun_versionId_createdAt_idx" ON "ReferenceFillRun"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferenceFillRun_proposalId_idx" ON "ReferenceFillRun"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceFillDecision_runId_position_key" ON "ReferenceFillDecision"("runId", "position");

-- AddForeignKey
ALTER TABLE "ReferenceFillRun" ADD CONSTRAINT "ReferenceFillRun_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceFillRun" ADD CONSTRAINT "ReferenceFillRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SocVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceFillRun" ADD CONSTRAINT "ReferenceFillRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceFillDecision" ADD CONSTRAINT "ReferenceFillDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReferenceFillRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceFillDecision" ADD CONSTRAINT "ReferenceFillDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

