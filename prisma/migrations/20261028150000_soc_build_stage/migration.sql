-- A scanned TOR build shows where its read is: waiting in the OCR line, or the page being read.
ALTER TABLE "SocBuild" ADD COLUMN "stage" TEXT;
