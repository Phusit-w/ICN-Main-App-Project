-- CreateTable
CREATE TABLE "ProposalTor" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalTor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalTor_proposalId_key" ON "ProposalTor"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalTor_storageKey_key" ON "ProposalTor"("storageKey");

-- AddForeignKey
ALTER TABLE "ProposalTor" ADD CONSTRAINT "ProposalTor_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalTor" ADD CONSTRAINT "ProposalTor_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
