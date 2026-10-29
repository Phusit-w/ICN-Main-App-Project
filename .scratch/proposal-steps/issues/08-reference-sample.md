# ตัวอย่าง SOC ที่เขียนอ้างอิงตามรูปแบบของทีม

Type: task
Status: resolved
Blocked by: —

## Question

HITL: the user sends one or two real SOCs whose reference column uses the team's format (heading from the Content outline + sub-folder name + page), together with the Datasheet folder tree they cite (folder names only are enough). Put the paths in an Answer. Never write to \\192.168.99.1\PS — copy samples out first if they live there.

## Comments

2026-10-29: sample 1 confirmed by user as the team format (more samples coming): Example SOC+TOR+Datasheet/MOF_RFID/เฉลย/ICN_ตารางเปรียบเทียบรายละเอียดคุณลักษณะเฉพ_R1_ok (P).docx. Reference cell lines: 'เอกสารส่วนที่ 2' / '<full sub-folder name e.g. 2.1 เครื่องคอมพิวเตอร์แม่ข่าย (Server) แบบ On premise>' / optional document name when a sub-folder holds several files / 'หน้า N' (also 'หน้าที่ N', 'หน้า 3, … หน้า 6'). Folder tree uses 'บทที่ 2 แคตตาล็อก…' while SOC says 'เอกสารส่วนที่ 2'. Apron 'DOA-A แก้ SOC.docx' has no หน้า/page in references — not usable.

## Answer

Two samples (2026-10-29), both under C:/Phusit/Claude Project/ICN Apps/Example SOC+TOR+Datasheet/:

1. MOF_RFID/เฉลย/ICN_ตารางเปรียบเทียบรายละเอียดคุณลักษณะเฉพ_R1_ok (P).docx — Thai, multi-line cell: 'เอกสารส่วนที่ 2' / full sub-folder name ('2.1 เครื่องคอมพิวเตอร์แม่ข่าย (Server) แบบ On premise') / optional document name when the sub-folder has several files ('Intel® Xeon® 6505P Processor') / 'หน้า N' or 'หน้าที่ N'. Datasheet tree: 'บทที่ 2 แคตตาล็อกและหรือรายการละเอียดคุณลักษณะเฉพาะของพัสดุ/2.N …/*.pdf' (SOC says ส่วนที่, folder says บทที่).
2. 4. DOAXXX_Apron…/Proposal A/2. ตารางเปรียบเทียบคุณลักษณะเฉพาะทางเทคนิค (Compliance Threshold)/06 G1-04-T2 Technical Compliance Comparison Table Surat CASRI-0923 - v2 (Word).docx — English, one line: 'CASRI Product Brochure, page N'; no Content heading; short document title for file '3. เอกสารรายละเอียดคุณลักษณะ (Catalog_Data Sheet)/08 CASRI Product brochure - surat-1_H3C_Modify_ebidding2-v4_R1.pdf'. (The Proposal A path exceeds Windows MAX_PATH: open with a \?\ prefix.)

Not usable: Proposal A/DOA-A แก้ SOC.docx (no page references).
