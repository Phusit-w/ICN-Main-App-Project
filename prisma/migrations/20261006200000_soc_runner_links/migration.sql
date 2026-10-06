-- CreateTable
CREATE TABLE "SocRunnerLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "runnerVersion" TEXT,
    "claudeLogin" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "revokedById" TEXT,

    CONSTRAINT "SocRunnerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocRunnerLink_tokenHash_key" ON "SocRunnerLink"("tokenHash");

-- CreateIndex
CREATE INDEX "SocRunnerLink_userId_revokedAt_idx" ON "SocRunnerLink"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "SocRunnerLink_createdAt_idx" ON "SocRunnerLink"("createdAt");

-- AddForeignKey
ALTER TABLE "SocRunnerLink" ADD CONSTRAINT "SocRunnerLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocRunnerLink" ADD CONSTRAINT "SocRunnerLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

