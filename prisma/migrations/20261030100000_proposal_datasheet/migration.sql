-- CreateTable
CREATE TABLE "ProposalDatasheet" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "citationName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalDatasheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDatasheet_storageKey_key" ON "ProposalDatasheet"("storageKey");

-- CreateIndex
CREATE INDEX "ProposalDatasheet_proposalId_idx" ON "ProposalDatasheet"("proposalId");

-- AddForeignKey
ALTER TABLE "ProposalDatasheet" ADD CONSTRAINT "ProposalDatasheet_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDatasheet" ADD CONSTRAINT "ProposalDatasheet_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
