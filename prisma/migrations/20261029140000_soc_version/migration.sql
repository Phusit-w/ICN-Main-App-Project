-- CreateTable
CREATE TABLE "SocVersion" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ready',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "originalName" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "sourceName" TEXT,
    "sourceStorageKey" TEXT,
    "warnings" JSONB,
    "rowPages" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocVersion_storageKey_key" ON "SocVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "SocVersion_sourceStorageKey_key" ON "SocVersion"("sourceStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "SocVersion_proposalId_number_key" ON "SocVersion"("proposalId", "number");

-- AddForeignKey
ALTER TABLE "SocVersion" ADD CONSTRAINT "SocVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocVersion" ADD CONSTRAINT "SocVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
