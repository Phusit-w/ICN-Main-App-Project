-- AlterTable
ALTER TABLE "SocJob" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CHECK';

-- CreateTable
CREATE TABLE "SocMajorItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT,
    "position" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'not_checked',
    "skillVersion" TEXT,
    "model" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "requestedById" TEXT,
    "ranById" TEXT,
    "missingDocuments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocMajorItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocMajorItem_jobId_position_idx" ON "SocMajorItem"("jobId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SocMajorItem_jobId_key_key" ON "SocMajorItem"("jobId", "key");

-- AddForeignKey
ALTER TABLE "SocMajorItem" ADD CONSTRAINT "SocMajorItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SocJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocMajorItem" ADD CONSTRAINT "SocMajorItem_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocMajorItem" ADD CONSTRAINT "SocMajorItem_ranById_fkey" FOREIGN KEY ("ranById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
