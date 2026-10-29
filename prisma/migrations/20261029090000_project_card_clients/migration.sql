-- CreateTable
CREATE TABLE "ProjectCardClient" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCardClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCardClient_code_key" ON "ProjectCardClient"("code");

-- Seed: the clients Question Search's prototype knew
-- (scripts/prototype-question-search/vocab.json on prototype/question-search).
-- The Thai names and abbreviations are drafts for the user to review in
-- Admin Center before the trial.
INSERT INTO "ProjectCardClient" ("id", "code", "names", "updatedAt") VALUES
  ('seed-client-nt', 'NT', ARRAY['บริษัท โทรคมนาคมแห่งชาติ', 'โทรคมนาคมแห่งชาติ', 'เอ็นที'], CURRENT_TIMESTAMP),
  ('seed-client-cat', 'CAT', ARRAY['กสท โทรคมนาคม', 'กสท', 'แคท', 'CAT Telecom'], CURRENT_TIMESTAMP),
  ('seed-client-tot', 'TOT', ARRAY['ทีโอที', 'องค์การโทรศัพท์แห่งประเทศไทย'], CURRENT_TIMESTAMP),
  ('seed-client-pea', 'PEA', ARRAY['การไฟฟ้าส่วนภูมิภาค', 'กฟภ.'], CURRENT_TIMESTAMP),
  ('seed-client-mea', 'MEA', ARRAY['การไฟฟ้านครหลวง', 'กฟน.'], CURRENT_TIMESTAMP),
  ('seed-client-egat', 'EGAT', ARRAY['การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย', 'กฟผ.'], CURRENT_TIMESTAMP),
  ('seed-client-obec', 'OBEC', ARRAY['สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน', 'สพฐ.'], CURRENT_TIMESTAMP),
  ('seed-client-cmu', 'CMU', ARRAY['มหาวิทยาลัยเชียงใหม่', 'มช.'], CURRENT_TIMESTAMP),
  ('seed-client-exim', 'EXIM', ARRAY['ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย', 'เอ็กซิมแบงก์'], CURRENT_TIMESTAMP),
  ('seed-client-ieat', 'IEAT', ARRAY['การนิคมอุตสาหกรรมแห่งประเทศไทย', 'การนิคมอุตสาหกรรม', 'นิคมอุตสาหกรรม', 'กนอ.'], CURRENT_TIMESTAMP),
  ('seed-client-onde', 'ONDE', ARRAY['สำนักงานคณะกรรมการดิจิทัลเพื่อเศรษฐกิจและสังคมแห่งชาติ', 'สดช.'], CURRENT_TIMESTAMP),
  ('seed-client-nbtc', 'NBTC', ARRAY['สำนักงาน กสทช.', 'กสทช.'], CURRENT_TIMESTAMP),
  ('seed-client-true', 'TRUE', ARRAY['ทรู', 'ทรูมูฟ', 'True'], CURRENT_TIMESTAMP),
  ('seed-client-ww', 'W&W', ARRAY['ไวร์เออ แอนด์ ไวร์เลส', 'Wire & Wireless'], CURRENT_TIMESTAMP);
