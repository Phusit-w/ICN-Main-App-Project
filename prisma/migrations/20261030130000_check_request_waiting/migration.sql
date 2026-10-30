-- AlterTable
ALTER TABLE "SocCheckRequest" ADD COLUMN "waiting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "takerId" TEXT,
ADD COLUMN "takenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SocCheckRequest_waiting_takerId_state_idx" ON "SocCheckRequest"("waiting", "takerId", "state");

-- AddForeignKey
ALTER TABLE "SocCheckRequest" ADD CONSTRAINT "SocCheckRequest_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
