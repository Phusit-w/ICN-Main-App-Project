-- A Local Check Run of an Excel SOC has no SOC_Check document (soc-image-rows
-- ticket 05). Every run so far keeps its document.
ALTER TABLE "SocCheckRun" ALTER COLUMN "documentId" DROP NOT NULL;
