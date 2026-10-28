-- SOC Builder (soc-builder ticket 03, ADR 0011): stored SOC Templates and SOC
-- Builds. Additive: new tables only, no existing table is touched.
-- CreateTable
CREATE TABLE "SocTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocBuild" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "pageRanges" TEXT NOT NULL,
    "pageRangeList" JSONB NOT NULL,
    "pagesDone" INTEGER NOT NULL DEFAULT 0,
    "pagesTotal" INTEGER,
    "errorMessage" TEXT,
    "warnings" JSONB,
    "rowCount" INTEGER,
    "torName" TEXT NOT NULL,
    "torStorageKey" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateStorageKey" TEXT NOT NULL,
    "outputStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purgeAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocTemplate_storageKey_key" ON "SocTemplate"("storageKey");

-- CreateIndex
CREATE INDEX "SocTemplate_createdAt_idx" ON "SocTemplate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocBuild_torStorageKey_key" ON "SocBuild"("torStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "SocBuild_templateStorageKey_key" ON "SocBuild"("templateStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "SocBuild_outputStorageKey_key" ON "SocBuild"("outputStorageKey");

-- CreateIndex
CREATE INDEX "SocBuild_ownerId_createdAt_idx" ON "SocBuild"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "SocBuild_purgeAfter_idx" ON "SocBuild"("purgeAfter");

-- AddForeignKey
ALTER TABLE "SocTemplate" ADD CONSTRAINT "SocTemplate_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocBuild" ADD CONSTRAINT "SocBuild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

