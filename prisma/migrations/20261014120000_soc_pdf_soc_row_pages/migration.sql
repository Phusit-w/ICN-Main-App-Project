-- PDF SOCs (soc-pdf-soc ticket 01, ADR 0009): the PDF page of each SOC row of
-- a job made from a PDF SOC. Additive: existing jobs keep null.
ALTER TABLE "SocJob" ADD COLUMN "socRowPages" JSONB;
