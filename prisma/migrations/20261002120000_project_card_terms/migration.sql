-- CreateTable
CREATE TABLE "ProjectCardTerm" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "th" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCardTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCardTerm_kind_value_key" ON "ProjectCardTerm"("kind", "value");

-- Seed: the lists that lived in lib/project-card-taxonomy.ts until now, with
-- the same values, so cards already classified keep pointing at them.
INSERT INTO "ProjectCardTerm" ("id", "kind", "value", "en", "th", "sortOrder", "updatedAt") VALUES
('term-cat-ip-network', 'category', 'ip-network', 'IP Network', 'โครงข่าย IP', 10, CURRENT_TIMESTAMP),
('term-cat-transmission', 'category', 'transmission', 'Transmission', 'ระบบสื่อสัญญาณ', 20, CURRENT_TIMESTAMP),
('term-cat-fiber-optic', 'category', 'fiber-optic', 'Fiber Optic', 'เคเบิลใยแก้วนำแสง', 30, CURRENT_TIMESTAMP),
('term-cat-microwave-radio', 'category', 'microwave-radio', 'Microwave & Radio', 'ไมโครเวฟและวิทยุสื่อสาร', 40, CURRENT_TIMESTAMP),
('term-cat-teleprotection', 'category', 'teleprotection', 'Teleprotection', 'ระบบป้องกันสายส่ง', 50, CURRENT_TIMESTAMP),
('term-cat-telecom-core', 'category', 'telecom-core', 'Telecom Core & OSS/BSS', 'ระบบหลักโทรคมนาคม', 60, CURRENT_TIMESTAMP),
('term-cat-data-center-it', 'category', 'data-center-it', 'Data Center & IT', 'ศูนย์ข้อมูลและไอที', 70, CURRENT_TIMESTAMP),
('term-cat-software', 'category', 'software', 'Software', 'ซอฟต์แวร์', 80, CURRENT_TIMESTAMP),
('term-cat-education-devices', 'category', 'education-devices', 'Education Devices', 'อุปกรณ์การเรียนการสอน', 90, CURRENT_TIMESTAMP),
('term-cat-smart-city-security', 'category', 'smart-city-security', 'Smart City & Security', 'เมืองอัจฉริยะและความปลอดภัย', 100, CURRENT_TIMESTAMP),
('term-cat-energy', 'category', 'energy', 'Energy', 'พลังงาน', 110, CURRENT_TIMESTAMP),
('term-cat-medical', 'category', 'medical', 'Medical', 'การแพทย์', 120, CURRENT_TIMESTAMP),
('term-wt-supply', 'workType', 'supply', 'Supply', 'จัดหาอุปกรณ์', 10, CURRENT_TIMESTAMP),
('term-wt-installation', 'workType', 'installation', 'Installation', 'ติดตั้ง', 20, CURRENT_TIMESTAMP),
('term-wt-ma', 'workType', 'ma', 'MA (Maintenance)', 'บำรุงรักษา (MA)', 30, CURRENT_TIMESTAMP),
('term-wt-managed-services', 'workType', 'managed-services', 'Managed Services', 'บริการบริหารจัดการระบบ', 40, CURRENT_TIMESTAMP),
('term-wt-rental', 'workType', 'rental', 'Rental', 'เช่าใช้', 50, CURRENT_TIMESTAMP),
('term-wt-system-development', 'workType', 'system-development', 'System Development', 'พัฒนาระบบ', 60, CURRENT_TIMESTAMP);
