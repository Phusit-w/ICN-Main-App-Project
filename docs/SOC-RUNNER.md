# SOC Runner: ลิงก์ โทเคน heartbeat และคำขอตรวจ

> ADR 0008, ticket 12 — โค้ดอยู่ที่ `lib/soc-runner.ts`, `app/api/soc/runner-link/route.ts`,
> `app/api/soc-runner/heartbeat/route.ts`
> ticket 13 (คำขอตรวจ + claim/ดาวน์โหลด/รายงาน/ส่งผล) — `lib/soc-check-requests.ts`, `actions/socCheckRequests.ts`,
> `app/api/soc-runner/claim`, `app/api/soc-runner/requests/[id]/*`

## ผู้ใช้เชื่อมเครื่อง

หน้า `/soc` มีกล่อง **SOC Runner ของคุณ** แสดงสถานะ (ออนไลน์ / ออฟไลน์ / ยังไม่เคยเชื่อมต่อ / ยังไม่ได้เชื่อมเครื่อง)
เวลาที่เห็นล่าสุด เวอร์ชันของ runner และสถานะการเข้าสู่ระบบ Claude

ปุ่ม **ดาวน์โหลดไฟล์เชื่อม SOC Runner** (`POST /api/soc/runner-link`, ต้องมีสิทธิ์ `soc`) สร้างไฟล์ `soc-runner.json`
ที่ผูกกับบัญชีผู้ใช้ที่ล็อกอินอยู่ ไม่ต้องใส่รหัสจับคู่ ใช้กับ SOC Runner ที่รันจาก source ผู้ตรวจทั่วไปใช้**คำสั่งติดตั้ง**แทน (หัวข้อ "ติดตั้ง" ด้านล่าง)
ซึ่งมีไฟล์เชื่อมเดียวกันนี้แนบอยู่ ถ้าตั้ง `SOC_RUNNER_CA_CERT_FILE` ไว้ ไฟล์เชื่อมจะมี `caCert` (PEM ของ root CA ของ server) เพิ่มด้วย

```json
{
  "format": "soc-runner-config/1",
  "serverUrl": "https://192.168.51.43",
  "token": "socr_<43 ตัว base64url>",
  "linkId": "...",
  "username": "...",
  "displayName": "...",
  "createdAt": "2026-10-06T10:00:00.000Z"
}
```

- server เก็บเฉพาะ sha256 ของโทเคน (`SocRunnerLink.tokenHash`) โทเคนจริงมีอยู่ในไฟล์ที่ดาวน์โหลดเท่านั้น และไม่ถูกเขียนลง audit
- ผู้ใช้หนึ่งคนมีลิงก์ที่ใช้ได้ครั้งละหนึ่งลิงก์ ดาวน์โหลดใหม่ = ลิงก์เดิมถูกยกเลิก (`revokeReason = "replaced"`) ทันที
  ใช้กรณีติดตั้งใหม่หรือย้ายเครื่อง
- `serverUrl` มาจาก `SOC_RUNNER_SERVER_URL` ถ้าตั้งไว้ (ควรตั้งบน server จริงที่อยู่หลัง Caddy) ไม่อย่างนั้นใช้ origin ของ request ที่ดาวน์โหลด

## Runner API

ทุก endpoint ของ runner อยู่ใต้ `/api/soc-runner/` ซึ่งไม่ต้องมี session cookie
`proxy.ts` ปฏิเสธ (401) request ที่ไม่มี `Authorization: Bearer socr_...` รูปแบบถูกต้องตั้งแต่ก่อนเข้า route
(scheme ไม่สนตัวพิมพ์เล็กใหญ่) แล้วแต่ละ route ต้องเรียก `authenticateSocRunner()` เพื่อตรวจว่าโทเคนยังใช้ได้
ถ้า route ใดเขียนข้อมูลที่ต้องไม่เกิดหลังลิงก์ถูกยกเลิก ให้กรอง `revokedAt: null` ในคำสั่งเขียนด้วย แบบ heartbeat

- `401 UNAUTHORIZED`: ไม่มีโทเคน, ไม่รู้จัก, ถูกยกเลิก หรือบัญชีผู้ใช้ถูกปิด → runner ควรบอกให้ดาวน์โหลดไฟล์เชื่อมใหม่
- `403 FORBIDDEN`: ผู้ใช้ไม่มีสิทธิ์ `soc` แล้ว

### `POST /api/soc-runner/heartbeat`

ส่งทุก 30 วินาที ถือว่า **ออนไลน์** ถ้า heartbeat ล่าสุดไม่เกิน 2 นาที (`SOC_RUNNER_ONLINE_MS` ใน `lib/soc-shared.ts`)

```json
{ "runnerVersion": "0.1.0", "claudeLogin": "logged_in" }
```

- `runnerVersion`: `A-Z a-z 0-9 . _ + -` ไม่เกิน 64 ตัว
- `claudeLogin`: `logged_in` | `logged_out` | `unknown` (`logged_out` ทำให้หน้า `/soc` เตือนให้เข้าสู่ระบบ Claude ใหม่)
- ตอบ `200 { "ok": true, "username": "...", "serverTime": "<ISO>" }`, `400` เมื่อ body ไม่ถูกต้อง (ไม่บันทึกอะไร)
- heartbeat ไม่ถูกบันทึกใน audit (มาทุก 30 วินาที)
- heartbeat ต่ออายุคำขอที่ runner นี้กำลังตรวจ (ไม่ให้กลับเป็น `requested`)

## คำขอตรวจ (Check Request, ticket 13)

ในหน้างาน SOC แบบนำเข้าผล ผู้ใช้ที่มีสิทธิ์ `soc` กด **ตรวจ** (หรือ **ตรวจซ้ำ**) ที่ข้อใหญ่ หรือ **ตรวจทั้งชุด** สำหรับทุกข้อที่ยังไม่ตรวจ
ระบบสร้าง `SocCheckRequest` เป็นของผู้กด และมีแต่ SOC Runner ของผู้กดเท่านั้นที่รับไปตรวจได้

- ขอตรวจได้เมื่อข้อใหญ่อยู่ในสถานะ `not_checked`, `checked` (ตรวจซ้ำ), `failed` หรือ `needs_documents` และไม่มีคำขอที่ยังเปิดอยู่
- ตรวจซ้ำข้อที่มีแถวยืนยันผลแล้ว: หน้าเว็บถามยืนยันก่อน แล้วบันทึกเลขแถวนั้นไว้ในคำขอ (`replaceConfirmed`) ตอนส่งผลจึงแทนที่ได้เฉพาะแถวเหล่านั้น
  ถ้ามีแถวถูกยืนยันเพิ่มหลังขอตรวจ การส่งผลจะถูกปฏิเสธ (409) และคำขอกลายเป็น `failed`
- **ส่งให้ Claude ตรวจใหม่** (หน้าตรวจทานผล): ติ๊กเลือกแถวแล้วกด ระบบสร้างคำขอหนึ่งรายการต่อข้อใหญ่ที่แถวนั้นอยู่ โดยเก็บเลขแถวใน
  `rowNumbers` runner บอก Claude ให้ตรวจเฉพาะแถวเหล่านั้น และตอนส่งผล server เก็บเฉพาะแถวที่เลือก (แถวอื่นในผลถูกทิ้ง
  ผลเดิมของแถวที่ไม่ได้เลือกยังอยู่) แถวที่เลือกซึ่งยืนยันแล้วถือว่าผู้กดยอมให้แทนที่ (หน้าเว็บถามก่อน) แถว **รอแก้ไข** ไม่ต้องถาม
- **ยกเลิกคำขอ** ได้เฉพาะตอนยัง `requested` (runner ยังไม่รับ) โดยผู้ขอหรือ ADMIN ข้อใหญ่กลับไปเป็นสถานะก่อนขอ
- ระหว่างมีคำขอเปิดอยู่ นำเข้าผลด้วยมือในข้อนั้นไม่ได้
- Audit: `SOC_CHECK_REQUESTED`, `SOC_CHECK_REQUEST_CANCELLED`, `SOC_CHECK_REQUEST_REPORTED` (เฉพาะสถานะพิเศษ) และ `SOC_RUN_IMPORTED`
  ตอนส่งผล ส่วนประวัติของงาน (`SocAuditEvent`) มี `CHECK_REQUESTED`, `CHECK_REQUEST_CLAIMED`, `CHECK_REQUEST_REPORTED`,
  `CHECK_REQUEST_RELEASED`, `CHECK_REQUEST_CANCELLED`

### สถานะ

| คำขอ | ข้อใหญ่แสดง | ความหมาย |
|---|---|---|
| `requested` | รอคิวตรวจ / **รอเครื่องของคุณเปิด** (runner ของผู้ขอออฟไลน์หรือยังไม่เชื่อม) | รอ runner ของผู้ขอ |
| `running` | กำลังตรวจ (+ ข้อความ progress) | runner รับไปแล้ว |
| `paused_quota` | หยุดชั่วคราว จะตรวจต่อประมาณ HH:MM | runner รับใหม่ได้เมื่อถึง `resumeAt` |
| `needs_login` | รอเข้าสู่ระบบ Claude | runner รับใหม่ได้เมื่อ heartbeat บอก `logged_in` |
| `needs_documents` | ขาดเอกสาร (+ ชื่อไฟล์) | ปิดคำขอ ปุ่ม [อัปโหลดเพิ่ม] (ไปที่ "เอกสารในงาน" แล้วกด **ตรวจใหม่**) หรือ [ตรวจต่อโดยไม่มีไฟล์นี้] |
| `failed` | ตรวจไม่สำเร็จ (+ เหตุผล) | ปิดคำขอ ปุ่ม **ลองใหม่** |
| `done` | ตรวจแล้ว | ส่งผลผ่านการนำเข้าแล้ว |
| `cancelled` | สถานะก่อนขอ | ผู้ใช้ยกเลิก |

คำขอที่ `running` แต่ไม่มีสัญญาณจาก runner (claim, report, ดาวน์โหลด หรือ heartbeat) นานกว่า 2 นาที (`SOC_CHECK_REQUEST_STALE_MS`)
จะกลับเป็น `requested` (ตรวจตอนมีการ claim และตอนเปิดหน้างาน) แล้ว runner ของผู้ใช้คนเดิมรับไปใหม่ได้

**[ตรวจต่อโดยไม่มีไฟล์นี้]** (ticket 15) สร้างคำขอใหม่ของผู้กด โดย `acknowledgedMissing` = ชื่อที่ runner รายงานว่าขาด
(server อ่านจากข้อใหญ่เอง ไม่รับจาก browser) รวมกับชื่อที่คำขอก่อนหน้ารับทราบไว้แล้ว skill จะตรวจแถวที่อ้างเอกสารนั้นเป็น
`unverifiable` และเมื่อส่งผลสำเร็จ ข้อใหญ่เก็บชื่อไว้ใน `missingDocuments` หน้างานจึงแสดง "ตรวจโดยไม่มีไฟล์: ..." และแถบเตือน
เหนือผลตรวจของข้อนั้น การกด **ตรวจใหม่** ธรรมดา (หลังอัปโหลดไฟล์ที่ขาด) ไม่รับทราบชื่อใด

นอกจากนี้ HEADLESS.md สั่งให้ `results.json` มี `missing_documents` ระดับบนสุดเสมอ (เอกสารที่ Claude หาไม่เจอระหว่างตรวจ
แม้ไม่ได้หยุดที่ขั้นที่ 0) ชื่อเหล่านั้นถูกเก็บใน `missingDocuments` ของข้อใหญ่เช่นกัน และหน้าตรวจทานผลเตือนแถวที่
`reference_check` เป็น `not_found`/`unverifiable` หรือ `evidence_support` เป็น `unverifiable` ("หาเอกสารไม่เจอ") พร้อมปุ่มกรองเฉพาะแถวเหล่านั้น

### `POST /api/soc-runner/claim`

ไม่มี body ตอบ `200 { "request": null }` เมื่อไม่มีงาน หรือ

```json
{ "request": {
  "id": "...", "claimedAt": "<ISO>",
  "job": { "id": "...", "title": "..." },
  "majorItem": { "id": "...", "key": "1", "label": "๑", "title": "..." },
  "acknowledgedMissing": [],
  "rows": [ { "row": 12, "item": "๕.๕.๓" } ],
  "skill": { "version": "...", "fileName": "....skill", "sizeBytes": 123, "checksum": "<sha256>", "url": "/api/soc-runner/requests/<id>/skill" },
  "documents": [ { "id": "...", "type": "SOC" | "EVIDENCE", "name": "...", "sizeBytes": 1, "checksum": "<sha256>", "url": "/api/soc-runner/requests/<id>/documents/<docId>" } ]
} }
```

- `rows`: แถวที่ผู้ตรวจเลือกส่งตรวจใหม่ (เลข row ตามตาราง SOC) ว่าง = ตรวจทั้งข้อใหญ่ runner ตั้งแต่ 0.2.3 ใส่ไว้ใน prompt
  (runner รุ่นเก่าตรวจทั้งข้อ แต่ server ก็ยังเก็บเฉพาะแถวที่เลือก)
- ได้เฉพาะคำขอของผู้ใช้เจ้าของโทเคน เก่าสุดก่อน (`createdAt`) และ skill ปัจจุบันถูก **ตรึง** ไว้กับคำขอตอน claim
- ถ้า link นี้มีคำขอ `running` ค้างอยู่ (เช่น runner restart) จะได้คำขอเดิมคืน
- ถ้า runner รายงาน Claude `logged_out` จะไม่ได้งานจนกว่า heartbeat บอก `logged_in`
- `409 { "error": "NO_SKILL_PACKAGE", "message": "ยังไม่มี skill บน server ติดต่อ admin" }` เมื่อมีงานรอแต่ยังไม่มี skill ปัจจุบัน

### `GET /api/soc-runner/requests/:id/documents/:documentId` และ `GET .../skill`

ไฟล์ SOC/PDF ของงาน และ skill ที่ตรึงไว้ (header `X-Soc-Skill-Version`, `X-Soc-Checksum`) ใช้ได้เฉพาะคำขอที่ link นี้กำลังตรวจ

### `POST /api/soc-runner/requests/:id/report`

```json
{ "state": "running", "progress": "ตรวจแล้ว 3/7 แถว" }
{ "state": "paused_quota", "resumeAt": "<ISO ไม่เกิน 7 วัน>", "progress": "..." }
{ "state": "needs_documents", "missingDocuments": ["ชื่อเอกสาร", "..."] }
{ "state": "failed", "reason": "ข้อความภาษาไทย" }
{ "state": "needs_login" }
```

ตอบ `200 { "ok": true }`, `400` body ไม่ถูกต้อง (ไม่บันทึกอะไร), `409 NOT_CLAIMED` เมื่อ link นี้ไม่ได้ตรวจคำขอนี้อยู่แล้ว

### `POST /api/soc-runner/requests/:id/submit`

multipart: `results` (results.json), `socCheck` (.docx), `model`, `skillVersion` (เว้นได้ ใช้เวอร์ชันที่ตรึงไว้),
`packetFallback` (runner ตั้งแต่ 0.3.0 ส่งมาเฉพาะเมื่อข้อนี้ไม่ได้ใช้ evidence packet: เหตุผลภาษาไทย ≤ 300 ตัวอักษร)
ผ่านการนำเข้าเดียวกับการอัปโหลดด้วยมือ (`importLocalCheckRun`, source `runner`) ตอบ `201 { runId, rowCount }`
event `RUN_IMPORTED` ของ run เก็บ `evidenceFlow` (`packet` เมื่อ `options` ใน results.json มี `evidence_packet` ไม่งั้น `standard`
ใช้กับการอัปโหลดด้วยมือด้วย) และ `packetFallback` ถ้ามี
หรือ `422 { errors }` / `409 { errors, confirmedRows }` ซึ่งปิดคำขอเป็น `failed` พร้อมเหตุผล (ส่งไฟล์เดิมซ้ำก็ไม่ผ่าน)

ทุก endpoint: คำขอของผู้ใช้อื่นตอบ `404` เสมอ (ไม่บอกว่ามีอยู่) ส่วน `401`/`403` เหมือน heartbeat

## ตัว SOC Runner (ticket 14, `soc-runner/`)

โปรแกรม Python (standard library ล้วน) ผู้ตรวจติดตั้งด้วยคำสั่งติดตั้งจากหน้า `/soc` (ticket 16) นักพัฒนารันจาก source ได้

```
npm run soc:runner -- path\to\soc-runner.json   # ไม่ระบุ = soc-runner/soc-runner.json (อยู่ใน .gitignore)
npm run soc:runner:test                          # unittest ด้วย server ปลอมและ Claude CLI ปลอม
```

- **ไม่เปิด port**: ส่ง heartbeat ทุก 30 วินาที (thread แยก จึงต่ออายุคำขอระหว่าง Claude ตรวจนานๆ) และ claim ทุก 15 วินาทีเมื่อว่าง
- ต่อหนึ่งคำขอ (`carry_out` ใน `runner.py`): รายงาน `running` → ดาวน์โหลด skill ที่ตรึงไว้ แตก zip ไปที่
  `<งาน>/.claude/skills/<name>/` (ตรวจ checksum และปฏิเสธ path ที่มี `..`) → ดาวน์โหลด SOC/หลักฐานไป `<งาน>/inputs/` ตามโฟลเดอร์ที่อัปโหลดมา (เช่น `inputs/บทที่ 2/2.5 …/tc22.pdf` เพราะ SOC อ้างชื่อโฟลเดอร์; ตัด `..` ทิ้ง และตัดโฟลเดอร์ชั้นนอกออกถ้า path ยาวเกิน 250 ตัวอักษรของ Windows)
  (ตรวจ checksum) → สร้าง evidence packet (ด้านล่าง) → รัน `claude -p` ในโฟลเดอร์งาน ให้เขียน `out/results.json` และ `out/SOC_Check.docx`
  → submit พร้อม `model` (โมเดลที่เขียนมากที่สุดใน `modelUsage`), `skillVersion` (header `X-Soc-Skill-Version`) และ `packetFallback` ถ้ามี
- **evidence packet (ticket 10, runner 0.3.0; ตัดสินใช้ที่ gate soc-evidence-packet 09)**: ก่อนเรียก Claude runner รัน
  `scripts/build_evidence_packet.py <inputs/SOC.docx> <ข้อใหญ่> inputs out/packet` ของ skill ที่ตรึงไว้ ด้วย `python.exe`
  ข้าง Python ของ runner (pythonw ไม่มี stdout; คำสั่งติดตั้งให้ PyMuPDF/python-docx แล้ว) จำกัด 20 นาที รายงาน progress "กำลังเตรียม evidence packet"
  สำเร็จ (exit 0 และมี `out/packet/job.json`) → prompt เปิด option `evidence_packet` และบอกว่า packet สร้างไว้แล้วที่ `out/packet`
  (skill ไม่สร้างซ้ำ) / ไม่สำเร็จ → ลบ packet ครึ่งๆ ทิ้ง ตรวจข้อนั้นด้วย flow เดิม ลง log และส่งเหตุผลเป็น `packetFallback`
  เหตุที่ข้าม packet: `SOC_RUNNER_PACKET=0`, skill รุ่นเก่าไม่มีตัวสร้าง, งานมี SOC มากกว่า/น้อยกว่า 1 ไฟล์, SOC ไม่ใช่ `.docx`,
  ตัวสร้างล้ม/ไม่เขียน job.json/นานเกิน การตัดสินใจเก็บใน `soc-runner-run.json` รอบที่ `--resume` จึงไม่สร้างใหม่และส่งเหตุผลเดิม
  ถ้า session หายแล้วเริ่มใหม่ ใช้ packet ที่สร้างไว้แล้ว
- prompt มี `SOC_RUNNER_HEADLESS=1`, ข้อใหญ่, โฟลเดอร์ output และ `acknowledged_missing` ตามสัญญาใน `docs/SOC-SKILL-HOSTING.md`
  และชี้ไปที่ skill ในโฟลเดอร์งานตรงๆ (กันชนกับ skill ชื่อเดียวกันที่ผู้ตรวจติดตั้งไว้เอง)
- `claude -p --output-format stream-json --verbose --model sonnet --permission-mode acceptEdits --allowedTools Bash,PowerShell,Read,Write,Edit,Glob,Grep,Skill,TodoWrite --disallowedTools WebFetch,WebSearch`
  พร้อม `--session-id <uuid>` (รอบแรก) หรือ `--resume <uuid>` (ตรวจต่อ)
  (บน Windows Claude Code รันคำสั่ง shell ผ่าน tool `PowerShell` ไม่ใช่ `Bash` ถ้าไม่อนุญาต ทุกคำสั่ง `python` จะติด "requires approval" แล้วหยุด)
  ใต้ login Claude ของผู้ใช้เครื่องนั้น สคริปต์ของ skill ต้องการ Python ที่มี python-docx / PyMuPDF: runner ใส่โฟลเดอร์ของ Python ที่ตัวเองรันอยู่
  ไว้หน้าสุดของ PATH ของ `claude` (คำสั่งติดตั้งให้ Python ที่มี package เหล่านี้) และรัน `claude` แบบไม่เปิดหน้าต่าง console
- โฟลเดอร์งานตั้งชื่อตาม id ของคำขอ และเก็บ session ของ Claude ไว้ใน `soc-runner-run.json` คำขอที่กลับมา
  (หลังหยุดรอโควตา, login ใหม่ หรือ runner restart) จึง `--resume` session เดิมพร้อมผลระหว่างทางใน `out/` แถวที่ตรวจแล้วไม่หาย
  ถ้า skill ที่ตรึงตอน claim ใหม่เป็นคนละเวอร์ชันกับรอบก่อน จะล้าง `out/` แล้วเริ่ม session ใหม่
- ผลลัพธ์: ส่งสำเร็จ → ลบโฟลเดอร์งาน / ล้มเหลว (ดาวน์โหลดไม่ครบ, Claude error, ไม่มี results.json หรือ SOC_Check)
  , server ตอบ error ระหว่างตรวจ หรือ runner ผิดพลาดเอง → รายงาน `failed` พร้อมเหตุผลภาษาไทย และเก็บโฟลเดอร์ไว้ดู
  / `409 NOT_CLAIMED` (ยกเลิกหรือหมดเวลา) → ลบโฟลเดอร์แล้วข้ามไปเงียบๆ
  / submit ถูกปฏิเสธ → server ปิดเป็น `failed` เองแล้ว runner ไม่รายงานซ้ำ (เก็บโฟลเดอร์ไว้ดู)
- `401` → บอกให้ดาวน์โหลดไฟล์เชื่อมใหม่ / `403` → บอกว่าไม่มีสิทธิ์ SOC แล้ว ทั้งคู่ลองใหม่ทุก 60 วินาที
- ความเสี่ยงที่รู้อยู่: skill ต้องใช้ Bash รันสคริปต์ Python ของตัวเอง จึงเปิด Bash ไว้ทั้งหมด PDF ของผู้ขายเป็นข้อมูลที่ไม่น่าเชื่อถือ
  (prompt injection) ปิด WebFetch/WebSearch แล้ว แต่ยังไม่ได้จำกัดคำสั่ง Bash
- ตัวแปร: `SOC_RUNNER_WORK_DIR` (ค่าเริ่มต้น `%LOCALAPPDATA%\SOCRunner\work`), `SOC_RUNNER_MODEL` (`sonnet`),
  `SOC_RUNNER_PACKET` (`0` = ไม่ใช้ evidence packet เช่น ตอนวัดโควตาของ flow เดิม),
  `SOC_RUNNER_TIMEOUT_MINUTES` (180), `SOC_RUNNER_CA_FILE` (root CA ของ Caddy `tls internal` ถ้าไม่ตั้งใช้ `caCert` ในไฟล์เชื่อม
  ทั้งสองแบบเชื่อเพิ่มจาก root ของ Windows)
- `runner.py <config> [--log ไฟล์]`: `--log` เขียนทุกข้อความ (มีเวลา) ลงไฟล์ เกิน 5 MB (ตอนเริ่มและระหว่างทำงาน) เก็บของเก่าไว้หนึ่งชุด (`.1`)
  รันได้ทีละตัวต่อไฟล์เชื่อม (`runner.lock` ข้างไฟล์เชื่อม) ตัวที่สองจะจบเองทันที
- หา `claude` จาก PATH ก่อน ไม่เจอใช้ `%USERPROFILE%\.local\bin\claude.exe` (runner ที่เริ่มตอน login อาจยังไม่เห็น PATH ใหม่)

### สถานะพิเศษ (ticket 15)

| เหตุการณ์ | runner ทำอะไร | หน้าเว็บ |
|---|---|---|
| skill เขียน `out/missing_documents.json` (ขั้นที่ 0 แบบ headless) | รายงาน `needs_documents` พร้อมชื่อ (ไม่นับชื่อใน `acknowledged_missing`) ไม่ submit และลบโฟลเดอร์งาน | ขาดเอกสาร + [อัปโหลดเพิ่ม] [ตรวจต่อโดยไม่มีไฟล์นี้] [ตรวจใหม่] |
| โควตา Claude หมด | รายงาน `paused_quota` โดย `resumeAt` = เวลา reset + 2 นาที (ไม่รู้เวลา → อีก 30 นาที) เก็บโฟลเดอร์งาน และ**ไม่ claim คำขอใดเลย**จนถึงเวลานั้น (โควตาเป็นของผู้ใช้) แล้ว claim คำขอเดิมกลับมา `--resume` ต่อเอง | หยุดชั่วคราว จะตรวจต่อประมาณ HH:MM |
| login ของ Claude หมดอายุ / ไม่ได้ login | รายงาน `needs_login` เก็บโฟลเดอร์งาน heartbeat ส่ง `logged_out` ทันที และไม่ claim อย่างน้อย 5 นาที (เพิ่มเป็นเท่าตัวทุกครั้งที่ยังหมดอายุ สูงสุด 30 นาที เพื่อให้หน้าเว็บเลิกแสดงว่ายังไม่ได้ login ไม่นานหลังผู้ใช้ /login ใหม่) จากนั้นเชื่อ `claude auth status` | รอเข้าสู่ระบบ Claude: เปิดโปรแกรม claude แล้วพิมพ์ /login |
| ล้มเหลวแบบอื่น | รายงาน `failed` พร้อมเหตุผลภาษาไทย | ตรวจไม่สำเร็จ + เหตุผล + [ลองใหม่] |

heartbeat ส่ง `claudeLogin` จาก `claude auth status --json` (`loggedIn` true/false, อ่านผลซ้ำทุก 5 นาที, ไม่ใช้โควตา)
คำสั่งนี้อ่านแค่ login ที่เก็บในเครื่อง login ที่หมดอายุแต่ยังอยู่ในเครื่องจึงยังเป็น `true` runner จึงรู้ว่าหมดอายุจากผลของการรันจริงเท่านั้น

#### Claude CLI แจ้งโควตาหมดและ login หมดอายุอย่างไร (ตรวจกับ Claude Code 2.1.291, 2026-10-06)

- **ไม่ได้ login** (ทดลองจริงด้วย `CLAUDE_CONFIG_DIR` ว่าง): exit code 1, บรรทัด `assistant` มี `"error": "authentication_failed"`,
  `"is_api_error_message": true` และบรรทัด `result` มี `"is_error": true`, `"terminal_reason": "api_error"`,
  `"result": "Not logged in · Please run /login"` ส่วน `claude auth status --json` ได้ `"loggedIn": false` exit 1
- **login หมดอายุ / ถูกเพิกถอน**: ข้อความใน CLI คือ "Login expired · Please run /login", "OAuth token revoked · Please run /login"
  หรือ "Please run /login · API Error: 401 ..." ใช้ `error` เดียวกัน (`authentication_failed`) ทดลองจริงไม่ได้เพราะต้องรอ token หมดอายุ
- **โควตา**: ทุกการรันส่งบรรทัด `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1791283800,"rateLimitType":"five_hour",...}}`
  (ทดลองจริง; `resetsAt` เป็นวินาที Unix) เมื่อโควตาหมด `status` เป็น `"rejected"` และ API ตอบ 429 ซึ่ง CLI จัดเป็น `error` แบบ `rate_limit`
  ข้อความเช่น "You've hit your session limit · resets 6:30pm" / "Claude AI usage limit reached" ส่วนนี้อ่านจากตัว CLI
  ยังไม่ได้ทดลองให้โควตาหมดจริง
- **`--resume` กับ session ที่ไม่มี** (ทดลองจริง): exit 1, stderr "No conversation found with session ID: …"
- runner (`claude_cli.interpret`) จึงตัดสินตามลำดับ:
  - "No conversation found" → `ClaudeSessionMissing` ถ้าเป็นการตรวจต่อ runner เริ่ม session ใหม่ แต่เก็บ `out/` ไว้
    และบอก Claude ให้ใช้ผลระหว่างทางที่มีอยู่ (ถ้าเป็นการตรวจครั้งแรก → `failed`)
  - `authentication_failed` / `oauth_org_not_allowed` (บัญชีไม่อยู่ในองค์กรที่อนุญาต ต้อง /login ใหม่ด้วยบัญชีอื่น) / status 401 /
    ข้อความ `/login` → `needs_login`
  - `rate_limit` / status 429 / `rate_limit_event` ที่ `rejected` / ข้อความ usage limit → `paused_quota` (เวลา reset จาก
    `resetsAt` ของ event ที่ `rejected`)
  - `billing_error` ("credit balance too low") → `failed` เพราะไม่หายเองเมื่อถึงเวลา จึงไม่ควรรอแล้วลองใหม่อัตโนมัติ
  - อย่างอื่น → `failed`
  ข้อความ `/login` / usage limit จะเชื่อก็ต่อเมื่อการรันจบด้วย API error เท่านั้น ไม่ใช่แค่ Claude เขียนคำเหล่านี้ในข้อความสุดท้าย

## ติดตั้ง (ticket 16: คำสั่ง PowerShell, ไม่มีไฟล์ .exe)

**ทำไมไม่มีตัวติดตั้ง `.exe`:** เครื่องของบริษัทเปิด Smart App Control (SAC) ซึ่งบล็อกโปรแกรมที่ไม่ได้ลงลายเซ็นและไม่มีใครเคยรัน
(ทุกไฟล์ที่ดาวน์โหลดไม่ซ้ำกัน จึงไม่มี reputation) และไม่มีปุ่ม "Run anyway" IT ตอบว่าไม่มี code-signing certificate และไม่ปิด SAC
(ticket 16, 2026-10-07) จึงติดตั้งด้วยโปรแกรมที่ SAC ยอมรับอยู่แล้วเท่านั้น: Windows PowerShell, Python จาก NuGet
(ลงลายเซ็นโดย Python Software Foundation), package จาก PyPI และ Claude Code ไม่มีอะไรหลบ SAC (ทดสอบบนเครื่องที่ SAC เปิดอยู่:
SAC ตรวจทุกไฟล์แล้วอนุญาต ไม่มี event บล็อกใน Code Integrity log)

ผู้ตรวจกด **สร้างคำสั่งติดตั้ง SOC Runner** ในหน้า `/soc` (`POST /api/soc/runner-install-command`, ต้องมีสิทธิ์ `soc`)
ได้คำสั่งบรรทัดเดียวพร้อมปุ่มคัดลอกและวิธีใช้ภาษาไทย แล้ววางใน **Windows PowerShell** (ไม่ใช่ PowerShell 7 ซึ่งไม่ใช้
`ServicePointManager` คำสั่งจะบอกเอง) ตัวอย่าง (บน server ที่ใช้ certificate ของตัวเอง):

```
if($PSVersionTable.PSEdition -eq 'Core'){throw '…'};[Net.ServicePointManager]::SecurityProtocol='Tls12';$p='<SHA-1 thumbprint>';[Net.ServicePointManager]::ServerCertificateValidationCallback={param($s,$c,$h,$e)$e -eq 'None' -or $c.GetCertHashString() -eq $p};$w=New-Object Net.WebClient;$w.Encoding=[Text.Encoding]::UTF8;$x=$w.DownloadString('https://<server>/api/soc-runner/install/soci_…');[Net.ServicePointManager]::ServerCertificateValidationCallback=$null;iex $x
```

ทำไมใช้ `WebClient` ไม่ใช่ `irm` (เจอบน prod 2026-10-08): `irm`/`Invoke-WebRequest` เรียกตัวตรวจ certificate บน thread อื่น
ซึ่ง script block ของ PowerShell รันไม่ได้ (`There is no Runspace available…` แสดงเป็น "An unexpected error occurred on
a send") ส่วน `WebClient` เรียกบน thread เดียวกัน แล้วคำสั่งล้างตัวตรวจทิ้งก่อนรันสคริปต์ เพราะ `bootstrap.ps1` ใช้
`Invoke-WebRequest` โหลดจาก NuGet ต่อ ห้ามเปลี่ยนไปเปิด socket เอง (`TcpClient` + `SslStream` + `iex`): Defender ลบไฟล์ที่มี
รูปแบบนั้นทันทีเพราะเหมือน download cradle ของมัลแวร์ server ที่ไม่มี pin (http หรือ certificate ที่ Windows เชื่ออยู่แล้ว)
ยังใช้ `iex (irm '…')` ตามเดิม

- **รหัสติดตั้ง** (`soci_…`, `SocRunnerInstallCode`, server เก็บแค่ sha256) ใช้ได้**ครั้งเดียว ภายใน 30 นาที** สร้างคำสั่งใหม่ =
  รหัสเดิมที่ยังไม่ใช้หมดสิทธิ์ การสร้างคำสั่ง**ยังไม่**แตะลิงก์เดิม ลิงก์ใหม่ถูกสร้าง (และลิงก์เดิมถูกยกเลิก `replaced`) ตอนวางคำสั่ง
- **Pin certificate:** ถ้า `SOC_RUNNER_SERVER_URL` เป็น https และตั้ง `SOC_RUNNER_CA_CERT_FILE` คำสั่งจะเชื่อ certificate ที่มี
  thumbprint นี้ (หรือ certificate ที่ Windows เชื่ออยู่แล้ว เพื่อให้ดาวน์โหลดจาก NuGet/PyPI ได้) ไฟล์นี้ต้องเป็น certificate
  ของ server เอง (self-signed ของ IIS) ไม่ใช่ root CA ที่ออก certificate ให้ server
- `GET /api/soc-runner/install/:code` (ไม่ต้องมี session; `proxy.ts` ปล่อยเฉพาะรหัสที่รูปแบบถูก) ตอบสคริปต์ PowerShell
  (`text/plain; charset=utf-8`): ตาราง `$SocRunnerFiles` (ไฟล์เชื่อมของผู้ใช้พร้อมโทเคนใหม่ และไฟล์ runner เป็น base64)
  ตามด้วย `soc-runner/bootstrap.ps1` ห่อด้วย `& { }` เพื่อไม่ให้โทเคนค้างในหน้าต่าง PowerShell ของผู้ใช้
  รหัสที่ใช้แล้ว หมดอายุ ไม่รู้จัก หรือผู้ใช้ไม่มีสิทธิ์ `soc`/ถูกปิดบัญชี ได้ `200` กับสคริปต์ที่แค่บอกเหตุผลเป็นภาษาไทย
  (ถ้าตอบ 4xx PowerShell จะแสดงแต่ error ของตัวเอง)
- ไฟล์ runner ที่ server แจก (`runner.py`, `claude_cli.py`, `server_client.py`, `install.py`, `requirements.txt`, `bootstrap.ps1`)
  อ่านจาก `soc-runner/` ตอนรัน `next build` ใส่ไว้ใน `.next\standalone` ให้ (`outputFileTracingIncludes` ใน `next.config.ts`)
  แก้โค้ด runner แล้ว deploy ตามปกติ ผู้ตรวจได้เวอร์ชันใหม่เมื่อวางคำสั่งใหม่ (ยังไม่มีการอัปเดตเอง)

### วางคำสั่งแล้วเกิดอะไรขึ้น (ไม่ใช้สิทธิ์ admin ทุกขั้น ทุกอย่างอยู่ใน `%LOCALAPPDATA%\SOCRunner`)

1. `bootstrap.ps1` ปิด SOC Runner ตัวเดิม (python/pythonw/SOCRunner ที่รันจาก `app\` พร้อม process ลูก เช่น `claude` ที่กำลังตรวจ)
   แล้วลบ `app\` ทั้งโฟลเดอร์ **วางคำสั่งซ้ำ = ซ่อม** ส่วน `work\` (งานที่หยุดรอโควตา) และ `runner.log` ไม่ถูกลบ
2. ดาวน์โหลด NuGet `python` 3.12.10 (ตรวจ sha256 ที่ตรึงไว้) แตกเป็น `app\python\` และ copy `pythonw.exe` เป็น `SOCRunner.exe`
3. เขียนไฟล์ runner ลง `app\runner\` และ `soc-runner.json` แล้ว `pip install --only-binary=:all: -r requirements.txt`
   (python-docx, PyMuPDF, openpyxl จาก PyPI) **เครื่องผู้ตรวจต้องเข้า `api.nuget.org` และ `pypi.org` ได้**
4. รัน `app\python\python.exe app\runner\install.py <root>` (`soc-runner/install.py`):
   - ตรวจไฟล์เชื่อม
   - ถ้ายังไม่มี Claude Code ที่ใช้ได้ (PATH หรือ `%USERPROFILE%\.local\bin\claude.exe`, ทดสอบด้วย `--version`)
     ดาวน์โหลด native build จาก `downloads.claude.ai` ตรวจ sha256 กับ manifest แล้ว `claude.exe install stable`
   - **ไม่ติดตั้ง Git**: Claude Code 2.1.292 รัน `claude -p` ได้โดยไม่มี Git และ bash ใน PATH และเรียก `python` ผ่าน shell tool ได้ (ทดสอบ 2026-10-07) บน Windows ใช้ tool PowerShell
   - เพิ่มโฟลเดอร์ของ `claude.exe` ใน PATH ของผู้ใช้ (HKCU\Environment) ถ้ายังไม่มี เพื่อให้พิมพ์ `claude` แล้ว `/login` ได้
     ตอน login หมดอายุ (ปัญหาเดิมใน `Problem/install-claude-code-no-admin.md`)
   - ตั้ง autostart: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` ค่า `SOCRunner` =
     `"…\app\python\SOCRunner.exe" "…\app\runner\runner.py" "…\soc-runner.json" "--log" "…\runner.log"`
   - ถ้า `claude auth status` บอกว่ายังไม่ได้ login เปิดหน้าต่าง `claude auth login --claudeai` (เปิดเบราว์เซอร์ให้) รอสูงสุด 15 นาที
     ถ้า login อยู่แล้ว (เช่น ติดตั้งซ้ำ) ข้ามขั้นนี้
   - เริ่ม runner ด้วย `SOCRunner.exe` (ไม่มีหน้าต่าง) ถ้ามีอีกตัวทำงานอยู่ ตัวใหม่จะจบเองเพราะ `runner.lock`
5. ขึ้น "ติดตั้ง SOC Runner เสร็จแล้ว" หรือเหตุผลที่ไม่สำเร็จเป็นสีแดง พร้อมบอกให้สร้างคำสั่งใหม่แล้ววางอีกครั้ง

ข้อควรรู้: ลิงก์เดิมถูกยกเลิกตอน**วางคำสั่ง** ถ้าติดตั้งไม่สำเร็จหลังจากนั้น เครื่องเดิมจะรับงานไม่ได้จนกว่าจะติดตั้งใหม่ให้สำเร็จ
(ตามการตัดสินใจ "หนึ่งลิงก์ต่อผู้ใช้" ใน ADR 0008) ลิงก์ "ดาวน์โหลดเฉพาะไฟล์เชื่อม" ในหน้า `/soc`
แสดงเฉพาะ ADMIN (นักพัฒนาที่รันจาก source) เพื่อไม่ให้ผู้ตรวจกดแล้วเครื่องที่ติดตั้งไว้หลุดโดยไม่ตั้งใจ

ดูปัญหาบนเครื่องผู้ตรวจ: `%LOCALAPPDATA%\SOCRunner\runner.log`
ถอนการติดตั้ง (ยังไม่มีปุ่ม): ลบค่า `SOCRunner` ใน `HKCU\…\Run`, ปิด `SOCRunner.exe` ใน Task Manager แล้วลบ `%LOCALAPPDATA%\SOCRunner`
(Claude Code และ login ของผู้ใช้ไม่ถูกลบ) แล้วให้ admin ยกเลิกลิงก์ที่ `/admin/soc-runners`

### ตั้งค่า server

**Server จริง (`psaidemo.icn21.local`): native บน Windows + IIS reverse proxy** (`docs/DEPLOY-WINDOWS.md`; ไม่มี Docker
เพราะ IT ปิด virtualization ไว้ทุกเครื่อง) deploy ด้วย `git pull` แล้ว `.\deploy\windows\update.ps1` ไม่ต้อง build อะไรเพิ่ม
และ server ไม่ต้องใช้ Python สำหรับการติดตั้ง SOC Runner

ตั้งค่าใน `.env` ของ server ครั้งเดียว (`.env` ไม่อยู่ใน git; `next build` copy เข้า `.next\standalone` ให้ จึงมีผลหลังรัน `update.ps1`):

```
SOC_RUNNER_SERVER_URL="https://psaidemo.icn21.local"
SOC_RUNNER_CA_CERT_FILE="C:\Apps\psaidemo-cert.pem"
```

- `SOC_RUNNER_SERVER_URL`: แอปอยู่หลัง IIS จึงเห็น address ภายในของตัวเอง ไม่ใช่ address ที่ผู้ตรวจใช้ และพอร์ต 3000
  เข้าได้แค่จากวง LAN เดียวกับ server (IT เปิด firewall แค่ 80/443/3389) runner จึงต้องเรียกผ่าน `https://psaidemo.icn21.local`
- `SOC_RUNNER_CA_CERT_FILE`: certificate ของ IIS เป็น self-signed (`New-SelfSignedCertificate`, หมดอายุ 2027-08-19)
  Windows และ Python ของผู้ตรวจไม่เชื่อ (ทดสอบ 2026-10-07: `CERTIFICATE_VERIFY_FAILED`) คำสั่งติดตั้ง pin thumbprint ของมัน
  และไฟล์เชื่อมทุกไฟล์มีมันเป็น `caCert` ให้ runner เชื่อ export เป็น PEM บน server (PowerShell แบบ admin) ครั้งเดียว:

  ```powershell
  $c = Get-ChildItem Cert:\LocalMachine\My | Where-Object Subject -eq "CN=psaidemo.icn21.local" | Sort-Object NotAfter -Descending | Select-Object -First 1
  "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($c.RawData, "InsertLineBreaks") + "`n-----END CERTIFICATE-----" | Set-Content C:\Apps\psaidemo-cert.pem -Encoding ascii
  ```

  เมื่อเปลี่ยน certificate ของ IIS: export ใหม่ทับไฟล์เดิม รัน `update.ps1` แล้วผู้ตรวจทุกคนต้องวางคำสั่งติดตั้งใหม่
  (ไฟล์เชื่อมเก็บ cert ตัวเดิมไว้) ถ้าค่านี้ชี้ไปที่ไฟล์ที่ไม่ใช่ PEM การสร้างคำสั่งและการดาวน์โหลดไฟล์เชื่อมจะล้มเหลว (500) โดยไม่แตะลิงก์เดิม
- ถ้า `SOC_STORAGE_ROOT` ไม่ได้ตั้งไว้ ไฟล์ SOC อยู่ใต้ `.next\standalone\data\soc` ซึ่ง `next build` สร้างใหม่ทุกครั้ง
  ควรตั้ง `SOC_STORAGE_ROOT` ไปที่โฟลเดอร์นอก repo (เช่น `C:\expense-billing-data\soc`) ตาม `.env.production.example`
- ไฟล์ `<SOC_STORAGE_ROOT>\runner\SOCRunnerSetup.exe` และค่า `SOC_RUNNER_INSTALLER_PATH` จากรุ่น `.exe` เดิมไม่ถูกใช้แล้ว ลบได้
  (`SOC_PYTHON` ก็ไม่ถูกใช้แล้วเช่นกัน ตั้งแต่ปุ่ม "ดาวน์โหลด SOC_Check" แบบ Word ถูกแทนด้วย Excel 2026-10-08)

## Admin

หน้า **Admin Center → SOC Runner** (`/admin/soc-runners`) แสดงทุกลิงก์ ทั้งที่ใช้งานอยู่และที่ยกเลิกแล้ว
พร้อมสถานะ เวลาที่เห็นล่าสุด และเวอร์ชัน ปุ่ม **ยกเลิกลิงก์** ใช้เมื่อเครื่องหายหรือเปลี่ยนผู้ใช้ เครื่องนั้นถูกปฏิเสธตั้งแต่ request ถัดไป
และหน้า `/soc` ของผู้ใช้คนนั้นขึ้นว่า "ลิงก์ของเครื่องคุณถูกยกเลิก" จนกว่าจะดาวน์โหลดไฟล์เชื่อมใหม่

Audit (ประวัติกิจกรรม): `SOC_RUNNER_LINKED` (ดาวน์โหลด, มี `replacedLinkIds`), `SOC_RUNNER_REVOKED` (admin ยกเลิก)
บันทึกใน transaction เดียวกับการเปลี่ยนลิงก์

ลิงก์ที่ใช้ได้หนึ่งลิงก์ต่อผู้ใช้ (ADR 0008) บังคับด้วย transaction แบบ Serializable (retry 3 ครั้ง) ไม่มี partial unique index
เพราะ Prisma schema แสดง index แบบมีเงื่อนไขไม่ได้ และ `migrate dev` ครั้งถัดไปจะพยายามลบทิ้ง
