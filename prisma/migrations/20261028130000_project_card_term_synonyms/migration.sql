-- AlterTable
ALTER TABLE "ProjectCardTerm" ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Seed: the words Question Search's prototype found naming each entry
-- (scripts/prototype-question-search/vocab.json on prototype/question-search),
-- minus those equal to the entry's own labels. Entries an admin added after
-- the first seed (video-conferencing, mobile-base-station,
-- satellite-communications) get theirs only where they exist; nothing else
-- in the table changes.
UPDATE "ProjectCardTerm" AS t SET "synonyms" = s.synonyms
FROM (VALUES
  ('category', 'ip-network', ARRAY['ไอพี', 'mpls']),
  ('category', 'transmission', ARRAY['สื่อสัญญาณ', 'dwdm', 'sdh']),
  ('category', 'fiber-optic', ARRAY['fiber', 'fibre', 'ไฟเบอร์', 'ใยแก้ว']),
  ('category', 'microwave-radio', ARRAY['microwave', 'ไมโครเวฟ', 'วิทยุสื่อสาร']),
  ('category', 'teleprotection', ARRAY['ป้องกันสายส่ง']),
  ('category', 'telecom-core', ARRAY['telecom core', 'oss', 'bss']),
  ('category', 'data-center-it', ARRAY['data center', 'datacenter', 'ศูนย์ข้อมูล', 'ดาต้าเซ็นเตอร์', 'ไอที']),
  ('category', 'software', ARRAY['ซอฟแวร์']),
  ('category', 'education-devices', ARRAY['การเรียนการสอน', 'education']),
  ('category', 'smart-city-security', ARRAY['smart city', 'เมืองอัจฉริยะ', 'cctv', 'กล้องวงจรปิด']),
  ('category', 'energy', ARRAY['solar', 'โซลาร์']),
  ('category', 'medical', ARRAY['โรงพยาบาล']),
  ('category', 'video-conferencing', ARRAY['video conference', 'vdo conference', 'ประชุมทางไกล']),
  ('category', 'mobile-base-station', ARRAY['base station', 'สถานีฐาน']),
  ('category', 'satellite-communications', ARRAY['satellite', 'ดาวเทียม']),
  ('workType', 'supply', ARRAY['จัดหา', 'จัดซื้อ']),
  ('workType', 'installation', ARRAY['install']),
  ('workType', 'ma', ARRAY['ma', 'maintenance', 'บำรุงรักษา', 'ซ่อมบำรุง']),
  ('workType', 'managed-services', ARRAY['managed service', 'บริหารจัดการระบบ']),
  ('workType', 'rental', ARRAY['rent', 'เช่า'])
) AS s(kind, value, synonyms)
WHERE t."kind" = s.kind AND t."value" = s.value;
