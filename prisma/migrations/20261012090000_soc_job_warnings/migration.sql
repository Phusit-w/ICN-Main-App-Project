-- What the reviewer was told when the SOC was uploaded (sheets of an Excel
-- SOC left out, pictures not read). Null for every job so far.
ALTER TABLE "SocJob" ADD COLUMN "socWarnings" JSONB;
