-- A Check Request may re-check only some rows of its major item (picked on
-- the review page); empty = the whole item, as before.
ALTER TABLE "SocCheckRequest" ADD COLUMN "rowNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
