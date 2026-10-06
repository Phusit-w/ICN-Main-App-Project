# SOC skill บน server (Skill Package)

> ADR 0008, ticket 11 — โค้ดอยู่ที่ `lib/soc-skill-package.ts` และข้อความคำสั่งอยู่ที่ `lib/soc-skill-headless.ts`

SOC Runner ไม่ได้ติดตั้ง skill ไว้ในเครื่อง ทุกครั้งที่ตรวจ มันจะดาวน์โหลด skill **เวอร์ชันปัจจุบัน** จาก server (ticket 13)
admin จึงอัปเดต skill ได้ทุกเครื่องพร้อมกันโดยไม่ต้องติดตั้งใหม่

## จัดการเวอร์ชัน (ADMIN เท่านั้น)

หน้า **Admin Center → SOC skill** (`/admin/soc-skills`)

- **อัปโหลด**: ไฟล์ `.skill` หรือ `.zip` ไม่เกิน 20 MB ต้องมี `SKILL.md` หนึ่งไฟล์ ที่รากของ zip หรือในโฟลเดอร์ของ skill
  (เช่น `tor-word-compliance-check/SKILL.md`) ชื่อไฟล์ใน zip ห้ามมี `..` หรือเป็น path แบบเต็ม
- **เวอร์ชัน**: ตั้งเองได้ (`A-Z a-z 0-9 . _ : + -` ไม่เกิน 100 ตัว) และห้ามซ้ำ ถ้าเว้นว่าง ระบบตั้งเป็น
  `sha256:<16 ตัวแรกของ sha256 ของไฟล์ที่อัปโหลด>` รูปแบบเหมือน `skill_version` ของการรันก่อนหน้านี้ แต่ค่า hash
  คิดจากไฟล์ zip ที่อัปโหลด จึงไม่ตรงกับค่าที่ผู้ตรวจรันจาก skill ในเครื่อง (ข้อใหญ่พวกนั้นจะขึ้นป้าย "ไม่ใช่เวอร์ชันบน server")
- **เวอร์ชันปัจจุบัน**: มีได้ครั้งละหนึ่งเวอร์ชันเสมอ (ตาราง `SocCurrentSkill` มีได้แถวเดียว)
  เวอร์ชันแรกที่อัปโหลดเป็นเวอร์ชันปัจจุบันทันที เวอร์ชันถัดไปต้องกด "ตั้งเป็นเวอร์ชันปัจจุบัน" เอง ย้อนกลับไปใช้เวอร์ชันเก่าก็ทำแบบเดียวกัน
- **ดาวน์โหลด**: ได้ไฟล์ตามที่ SOC Runner ได้รับ (มี HEADLESS.md แล้ว)
- ก่อนอัปโหลดครั้งแรกจะยังไม่มีเวอร์ชันปัจจุบัน (`currentSocSkillPackage()` คืน `null`) runner API (ticket 13)
  ต้องตอบกรณีนี้ให้ชัด เช่น "ยังไม่มี skill บน server ติดต่อ admin" 
- ทุกการอัปโหลดและการเปลี่ยนเวอร์ชันปัจจุบันบันทึกใน ประวัติกิจกรรม (`SOC_SKILL_UPLOADED`, `SOC_SKILL_SET_CURRENT`)

ไฟล์เก็บที่ `SOC_STORAGE_ROOT/skill-packages/<id>.skill` (private storage เดียวกับไฟล์ SOC) ไม่หมดอายุ 90 วันเหมือนงาน SOC

## สิ่งที่ server เพิ่มให้ package (คำสั่งโหมด headless)

ขั้นที่ 0 ของ skill บอกให้ "แจ้งผู้ใช้ทันที" เมื่อเอกสารที่ SOC อ้างไม่มีไฟล์ แต่ SOC Runner รัน `claude -p` โดยไม่มีใครตอบ
ตอนอัปโหลด server จึงเก็บ package ในรูปที่จะส่งให้ SOC Runner ซึ่งต่างจากไฟล์ต้นฉบับสองจุด (ไฟล์อื่นเหมือนเดิมทุก byte)

1. เพิ่ม `HEADLESS.md` ไว้ข้าง `SKILL.md` (ถ้า package มีไฟล์ชื่อนี้อยู่แล้ว จะถูกแทนที่)
2. ใส่ข้อความสั้นๆ ใน `SKILL.md` ต่อจาก frontmatter ชี้ไปที่ `HEADLESS.md` (ครอบด้วย `<!-- soc-headless:begin/end -->`
   อัปโหลด package ที่ดาวน์โหลดจาก server ซ้ำก็ไม่ซ้อนกัน)

คำสั่งนี้มีผล **เฉพาะเมื่อ prompt มีข้อความ `SOC_RUNNER_HEADLESS=1`** ผู้ตรวจที่ใช้ skill ใน Claude Code เองจึงได้พฤติกรรมเดิม

### สัญญากับ SOC Runner (ticket 14)

prompt ของ runner ต้องมี

- `SOC_RUNNER_HEADLESS=1`
- เลขข้อใหญ่ที่ตรวจ และโฟลเดอร์ output
- `acknowledged_missing`: ชื่อเอกสารที่ผู้ตรวจกด [ตรวจต่อโดยไม่มีไฟล์นี้] แล้ว (ว่างได้)

ถ้าเอกสารที่ถูกอ้างขาด และไม่อยู่ใน `acknowledged_missing` skill จะเขียน `missing_documents.json` ในโฟลเดอร์ output แล้วหยุด
โดย**ไม่**เขียน `results.json` หรือ SOC_Check

```json
{
  "status": "needs_documents",
  "major_item": "๑",
  "missing_documents": [
    { "name": "Section 3.2 Datasheet ของ Core Switch", "cited_in_rows": [3, 5] }
  ],
  "available_documents": ["Datasheet_A.pdf", "Catalog_B.pdf"]
}
```

runner แปลงไฟล์นี้เป็นสถานะ `needs_documents` (ส่งชื่อใน `missing_documents[].name`) เมื่อผู้ตรวจเลือกตรวจต่อโดยไม่มีไฟล์
request จะถูกส่งใหม่พร้อมชื่อนั้นใน `acknowledged_missing` แถวที่อ้างเฉพาะเอกสารนั้นจะได้ `unverifiable` พร้อม `key_issue` "ไม่มีไฟล์ …"

## เวอร์ชันของข้อใหญ่ในหน้างาน

หน้างาน SOC แสดง "skill ปัจจุบัน" และเวอร์ชันที่แต่ละข้อใหญ่ตรวจ (`SocMajorItem.skillVersion`) โดยเทียบตามลำดับการอัปโหลด
(`skillVersionStatus` ใน `lib/soc-shared.ts`)

- **เก่ากว่าเวอร์ชันปัจจุบัน**: เวอร์ชันของข้อนั้นอยู่บน server และอัปโหลดก่อนเวอร์ชันปัจจุบัน ควรพิจารณาตรวจซ้ำ
- **ไม่ใช่เวอร์ชันบน server**: เวอร์ชันไม่อยู่ในรายการ เช่น นำเข้าผลด้วยมือจาก skill ในเครื่อง เทียบลำดับไม่ได้
- เวอร์ชันปัจจุบัน หรือเวอร์ชันที่อัปโหลดหลังเวอร์ชันปัจจุบัน (เมื่อ admin ย้อนเวอร์ชัน) ไม่มีป้าย
