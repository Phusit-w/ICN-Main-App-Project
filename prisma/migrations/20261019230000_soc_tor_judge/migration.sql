-- TOR Match 07: Claude judges the TOR Match lines code could not settle, as a
-- Check Request of kind "tor_judge" with no major item. Additive: a new kind
-- column defaulting to "check", majorItemId may be null, nullable link to the
-- TOR Match. SocTorMatch.scanned is backfilled from the attach audit event.

-- AlterTable
ALTER TABLE "SocTorMatch" ADD COLUMN     "scanned" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SocTorMatch" m SET "scanned" = true
WHERE EXISTS (
  SELECT 1 FROM "SocAuditEvent" e
  WHERE e."jobId" = m."jobId" AND e."action" IN ('TOR_ATTACHED', 'TOR_REPLACED')
    AND e."detail"->>'documentId' = m."documentId" AND e."detail"->>'scanned' = 'true'
);

-- AlterTable
ALTER TABLE "SocCheckRequest" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'check',
ADD COLUMN     "torLineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "torMatchId" TEXT,
ALTER COLUMN "majorItemId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SocCheckRequest_torMatchId_idx" ON "SocCheckRequest"("torMatchId");

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_torMatchId_fkey" FOREIGN KEY ("torMatchId") REFERENCES "SocTorMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
