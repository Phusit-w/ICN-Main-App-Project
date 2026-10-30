# Proposal build — ticket board

Spec: `.scratch/proposal-steps/spec.md` (ready-for-agent). Decisions: `.scratch/proposal-steps/map.md` (wayfinder, complete 2026-10-29). Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md` § Proposal. ADRs 0012, 0013.

Work blockers-first, one ticket per fresh session (`/implement`), `/clear` between.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | Proposal: รายการ หน้า step และถังขยะ | — | done |
| 02 | TOR ของ Proposal | 01 | done |
| 03 | Datasheet ของ Proposal | 01 | done |
| 04 | ฉบับ SOC จากการ upload | 01 | done |
| 05 | สร้าง SOC ใน Proposal | 02, 04 | done |
| 06 | ตรวจ TOR ตรงต้นฉบับ และตรวจหลักฐาน ต่อฉบับ | 02, 03, 04 | done (browser check left; not deployed) |
| 07 | รอคนรับ | 06 | done (browser check left; not deployed) |
| 08 | กรอกอ้างอิง: ขั้นโค้ดและตารางรับ/แก้ | 03, 04 | done (browser check left; not deployed) |
| 09 | กรอกอ้างอิง: เขียนฉบับ SOC ใหม่ | 08 | done (browser check left; not deployed) |
| 10 | กรอกอ้างอิง: ขั้น AI บน Runner | 07, 08 | ready-for-agent |
| 11 | Guided Tour | 06, 09 | ready-for-agent |
| 12 | Claude อ่าน TOR แบบสแกน (แทน OCR ภายนอก) | 02, 07 | ready-for-agent |
| 13 | สร้าง SOC รองรับ TOR หลายรูปแบบ (จากตัวอย่างจริง) | 05; comparison needs 12 | survey + scope decided; fixes wait for 12 |
| 14 | สร้าง SOC หลายไฟล์จาก TOR ชุดเดียว | 13, 12 | needs-triage |
| 15 | สร้าง SOC เป็นไฟล์ Excel | 05 (best after 13) | needs-triage |
| 16 | แปลง .doc เป็น .docx อัตโนมัติตอน upload | best after 13, 12; needs IT | needs-triage |
| 17 | สร้าง SOC Template จาก SOC เก่า | 05 (best after 13) | needs-triage |

Repo rules: large unrelated uncommitted WIP — stage only this ticket's files, never `git add -A`; fresh test DB name each run (see memory); browser check light/dark/narrow for UI.
