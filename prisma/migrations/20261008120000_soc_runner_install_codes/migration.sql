-- CreateTable
CREATE TABLE "SocRunnerInstallCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "SocRunnerInstallCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocRunnerInstallCode_codeHash_key" ON "SocRunnerInstallCode"("codeHash");

-- CreateIndex
CREATE INDEX "SocRunnerInstallCode_createdAt_idx" ON "SocRunnerInstallCode"("createdAt");

-- AddForeignKey
ALTER TABLE "SocRunnerInstallCode" ADD CONSTRAINT "SocRunnerInstallCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
