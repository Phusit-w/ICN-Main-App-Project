// The headless instruction the server adds to every SOC skill package it
// serves (lib/soc-skill-package.ts, docs/SOC-SKILL-HOSTING.md). The skill's
// step 0 tells Claude to stop and ask the user when a document the SOC cites
// is missing; under `claude -p` on a SOC Runner nobody can answer, so this
// turns that question into a structured result the runner reports as
// `needs_documents`.

export const HEADLESS_FILE = "HEADLESS.md";

// The phrase a SOC Runner puts in its prompt to switch the skill into this
// mode. Interactive use (a reviewer in Claude Code) never contains it.
export const HEADLESS_MARKER = "SOC_RUNNER_HEADLESS=1";

export const MISSING_DOCUMENTS_FILE = "missing_documents.json";

export const HEADLESS_INSTRUCTION = `# โหมด headless (SOC Runner)

ไฟล์นี้ server ใส่เพิ่มให้ทุก package ของ skill ที่ SOC Runner ดาวน์โหลด ไม่ได้เป็นส่วนของ skill ต้นฉบับ

**ใช้เฉพาะเมื่อ prompt มีข้อความ \`${HEADLESS_MARKER}\`** ซึ่งแปลว่ากำลังรันด้วย \`claude -p\` บนเครื่องของผู้ตรวจ
และไม่มีใครคอยตอบคำถาม ถ้า prompt ไม่มีข้อความนี้ ให้ข้ามไฟล์นี้ทั้งหมดและทำตาม SKILL.md ตามปกติ

## ห้ามถามคำถาม

ในโหมดนี้ห้ามถามผู้ใช้และห้ามรอคำตอบในทุกขั้นตอน ถ้า SKILL.md บอกให้ถามหรือแจ้งผู้ใช้แล้วรอ ให้ทำตามข้อด้านล่าง
หรือเลือกค่าที่ prompt กำหนด (โหมด \`full_audit\` + option ที่ prompt เปิด: \`evidence_support\`, \`tor_decision\`
และ \`evidence_packet\` เมื่อ prompt บอกว่าสร้าง packet ไว้แล้ว) แล้วทำต่อ

## evidence packet

เมื่อ prompt เปิด \`evidence_packet\` ให้ทำตาม \`references/evidence-packet.md\` ทุกขั้นเหมือนตอนมีผู้ใช้ โหมด headless ไม่ได้ยกเว้นข้อใด
โดยเฉพาะ P2/P3: เปิด \`rows/*.json\` และ \`page_file\` ของทุกหน้าทีละไฟล์ด้วย tool Read ห้ามเขียนสคริปต์ python/shell
รวมหรือ dump หลายไฟล์ของ packet ลงไฟล์เดียวแล้วอ่านแทน

## ขั้นที่ 0: เอกสารที่ถูกอ้างไม่ครบ

ทำขั้นที่ 0 ของ SKILL.md ตามเดิม คือรวบรวมชื่อเอกสาร/Section ทุกรายการที่คอลัมน์อ้างอิงของแถวในข้อใหญ่ที่ต้องตรวจ
อ้างถึง แล้วเทียบกับไฟล์หลักฐานที่ได้รับ ถ้ามีเอกสารที่ถูกอ้างแต่ไม่มีไฟล์ให้ตรงตัว และชื่อนั้น**ไม่อยู่**ในรายการ
\`acknowledged_missing\` ของ prompt ให้ทำแทนการแจ้งผู้ใช้ดังนี้

1. เขียนไฟล์ \`${MISSING_DOCUMENTS_FILE}\` ในโฟลเดอร์ output ที่ prompt กำหนด เป็น UTF-8 ตามรูปแบบนี้

   \`\`\`json
   {
     "status": "needs_documents",
     "major_item": "๑",
     "missing_documents": [
       { "name": "Section 3.2 Datasheet ของ Core Switch", "cited_in_rows": [3, 5] }
     ],
     "available_documents": ["Datasheet_A.pdf", "Catalog_B.pdf"]
   }
   \`\`\`

   - \`status\`: \`"needs_documents"\` เสมอ
   - \`major_item\`: เลขข้อใหญ่ตามที่ prompt ระบุ
   - \`missing_documents\`: หนึ่งรายการต่อเอกสารที่ขาด \`name\` คือชื่อตามที่ SOC เขียนในคอลัมน์อ้างอิง
     \`cited_in_rows\` คือเลข \`row\` ทุกแถวที่อ้างเอกสารนั้น
   - \`available_documents\`: ชื่อไฟล์หลักฐานทุกไฟล์ที่ได้รับ
2. **หยุดทันที** ห้ามตรวจแถวใด ห้ามเขียน \`results.json\` และห้ามสร้างไฟล์ SOC_Check เพื่อไม่ให้เสีย quota กับแถวที่ยืนยันไม่ได้
3. ตอบกลับสั้นๆ ว่าหยุดเพราะขาดเอกสาร และบอกชื่อไฟล์ \`${MISSING_DOCUMENTS_FILE}\`

## เมื่อผู้ตรวจเลือก "ตรวจต่อโดยไม่มีไฟล์นี้"

prompt จะมีรายการ \`acknowledged_missing\` ซึ่งเป็นชื่อเอกสารที่ผู้ตรวจรับทราบแล้วว่าไม่มีไฟล์ ชื่อในรายการนี้ไม่ทำให้หยุดที่ขั้นที่ 0
ให้ตรวจต่อตามปกติ แถวที่อ้างเฉพาะเอกสารนั้นให้ \`reference_check: unverifiable\` และ \`evidence_support: unverifiable\`
และให้ \`key_issue\` ระบุว่า "ไม่มีไฟล์ <ชื่อเอกสาร>" ห้ามปล่อยเป็น \`unverifiable\` เงียบๆ โดยไม่บอกสาเหตุ
ถ้ายังมีเอกสารที่ขาดและไม่อยู่ในรายการ ให้ทำตามหัวข้อขั้นที่ 0 ด้านบน

## เอกสารที่หาไม่เจอระหว่างตรวจ

\`results.json\` ต้องมี key ระดับบนสุด \`missing_documents\` เสมอ เป็นรายการเอกสารที่ SOC อ้างแต่ตรวจแล้วหาไฟล์ไม่เจอ
หรือเปิดไม่ได้ ทั้งที่อยู่ใน \`acknowledged_missing\` และที่เพิ่งพบระหว่างตรวจ (เช่น ชื่อโฟลเดอร์หรือชื่อไฟล์ที่อ้างไม่ตรงกับไฟล์ใด)
รูปแบบเดียวกับขั้นที่ 0: \`[{ "name": "<ชื่อตามที่ SOC เขียน>", "cited_in_rows": [<row>, ...] }]\` ถ้าหาเจอครบให้เป็น \`[]\`
ห้ามเดาว่าไฟล์อื่นที่ชื่อใกล้เคียงคือเอกสารนั้นโดยไม่บอก หน้าเว็บจะเตือนผู้ตรวจจากรายการนี้
`;

// The note put right after SKILL.md's frontmatter, so Claude reads
// HEADLESS.md before step 0. The markers let the server replace it, so
// re-uploading a served package doesn't add it twice.
export const SKILL_NOTE_BEGIN = "<!-- soc-headless:begin -->";
export const SKILL_NOTE_END = "<!-- soc-headless:end -->";
export const SKILL_NOTE = `${SKILL_NOTE_BEGIN}
> **โหมด headless (SOC Runner):** ถ้า prompt มีข้อความ \`${HEADLESS_MARKER}\` ให้อ่าน [${HEADLESS_FILE}](${HEADLESS_FILE}) ก่อนเริ่ม
> ในโหมดนั้นขั้นที่ 0 ห้ามถามผู้ใช้ ให้เขียน \`${MISSING_DOCUMENTS_FILE}\` แล้วหยุดแทน
${SKILL_NOTE_END}`;
