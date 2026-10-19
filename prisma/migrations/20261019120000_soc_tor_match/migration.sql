-- TOR Match (tor-match ticket 03): a TOR Match result per job and its outcome
-- lines. Additive: new tables only, existing jobs have no TOR Match.
-- CreateTable
CREATE TABLE "SocTorMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pages" JSONB,
    "counts" JSONB,
    "warnings" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocTorMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocTorMatchLine" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "socRow" INTEGER,
    "item" TEXT,
    "outcome" TEXT NOT NULL,
    "socText" TEXT,
    "torText" TEXT,
    "torPage" INTEGER,
    "claudeOutcome" TEXT,
    "claudeReason" TEXT,

    CONSTRAINT "SocTorMatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocTorMatch_jobId_key" ON "SocTorMatch"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "SocTorMatch_documentId_key" ON "SocTorMatch"("documentId");

-- CreateIndex
CREATE INDEX "SocTorMatchLine_matchId_position_idx" ON "SocTorMatchLine"("matchId", "position");

-- AddForeignKey
ALTER TABLE "SocTorMatch" ADD CONSTRAINT "SocTorMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SocJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocTorMatch" ADD CONSTRAINT "SocTorMatch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SocDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocTorMatchLine" ADD CONSTRAINT "SocTorMatchLine_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "SocTorMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

