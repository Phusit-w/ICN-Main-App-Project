-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "referenceStyle" TEXT;

-- AlterTable
ALTER TABLE "ReferenceFillRun" ADD COLUMN "styleGuess" TEXT NOT NULL DEFAULT 'thai';
