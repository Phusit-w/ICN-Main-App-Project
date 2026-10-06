# SOC Runner: ลิงก์ โทเคน heartbeat และคำขอตรวจ

> ADR 0008, ticket 12 — โค้ดอยู่ที่ `lib/soc-runner.ts`, `app/api/soc/runner-link/route.ts`,
> `app/api/soc-runner/heartbeat/route.ts`
> ticket 13 (คำขอตรวจ + claim/ดาวน์โหลด/รายงาน/ส่งผล) — `lib/soc-check-requests.ts`, `actions/socCheckRequests.ts`,
> `app/api/soc-runner/claim`, `app/api/soc-runner/requests/[id]/*`

## ผู้ใช้เชื่อมเครื่อง

หน้า `/soc` มีกล่อง **SOC Runner ของคุณ** แสดงสถานะ (ออนไลน์ / ออฟไลน์ / ยังไม่เคยเชื่อมต่อ / ยังไม่ได้เชื่อมเครื่อง)
เวลาที่เห็นล่าสุด เวอร์ชันของ runner และสถานะการเข้าสู่ระบบ Claude

ปุ่ม **ดาวน์โหลดไฟล์เชื่อม SOC Runner** (`POST /api/soc/runner-link`, ต้องมีสิทธิ์ `soc`) สร้างไฟล์ `soc-runner.json`
ที่ผูกกับบัญชีผู้ใช้ที่ล็อกอินอยู่ ไม่ต้องใส่รหัสจับคู่ จนกว่าจะมีตัวติดตั้ง (ticket 16) ให้วางไฟล์นี้ไว้ข้าง SOC Runner ที่รันจาก source

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
| `needs_documents` | ขาดเอกสาร (+ ชื่อไฟล์) | ปิดคำขอ ผู้ใช้เพิ่ม PDF แล้วกดตรวจใหม่ (ปุ่ม [ตรวจต่อโดยไม่มีไฟล์นี้] เป็นของ ticket 15) |
| `failed` | ตรวจไม่สำเร็จ (+ เหตุผล) | ปิดคำขอ กดตรวจใหม่ได้ |
| `done` | ตรวจแล้ว | ส่งผลผ่านการนำเข้าแล้ว |
| `cancelled` | สถานะก่อนขอ | ผู้ใช้ยกเลิก |

คำขอที่ `running` แต่ไม่มีสัญญาณจาก runner (claim, report, ดาวน์โหลด หรือ heartbeat) นานกว่า 2 นาที (`SOC_CHECK_REQUEST_STALE_MS`)
จะกลับเป็น `requested` (ตรวจตอนมีการ claim และตอนเปิดหน้างาน) แล้ว runner ของผู้ใช้คนเดิมรับไปใหม่ได้

### `POST /api/soc-runner/claim`

ไม่มี body ตอบ `200 { "request": null }` เมื่อไม่มีงาน หรือ

```json
{ "request": {
  "id": "...", "claimedAt": "<ISO>",
  "job": { "id": "...", "title": "..." },
  "majorItem": { "id": "...", "key": "1", "label": "๑", "title": "..." },
  "acknowledgedMissing": [],
  "skill": { "version": "...", "fileName": "....skill", "sizeBytes": 123, "checksum": "<sha256>", "url": "/api/soc-runner/requests/<id>/skill" },
  "documents": [ { "id": "...", "type": "SOC" | "EVIDENCE", "name": "...", "sizeBytes": 1, "checksum": "<sha256>", "url": "/api/soc-runner/requests/<id>/documents/<docId>" } ]
} }
```

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

multipart: `results` (results.json), `socCheck` (.docx), `model`, `skillVersion` (เว้นได้ ใช้เวอร์ชันที่ตรึงไว้)
ผ่านการนำเข้าเดียวกับการอัปโหลดด้วยมือ (`importLocalCheckRun`, source `runner`) ตอบ `201 { runId, rowCount }`
หรือ `422 { errors }` / `409 { errors, confirmedRows }` ซึ่งปิดคำขอเป็น `failed` พร้อมเหตุผล (ส่งไฟล์เดิมซ้ำก็ไม่ผ่าน)

ทุก endpoint: คำขอของผู้ใช้อื่นตอบ `404` เสมอ (ไม่บอกว่ามีอยู่) ส่วน `401`/`403` เหมือน heartbeat

## ตัว SOC Runner (ticket 14, `soc-runner/`)

โปรแกรม Python (standard library ล้วน) รันจาก source จนกว่าจะมีตัวติดตั้ง (ticket 16)

```
npm run soc:runner -- path\to\soc-runner.json   # ไม่ระบุ = soc-runner/soc-runner.json (อยู่ใน .gitignore)
npm run soc:runner:test                          # unittest ด้วย server ปลอมและ Claude CLI ปลอม
```

- **ไม่เปิด port**: ส่ง heartbeat ทุก 30 วินาที (thread แยก จึงต่ออายุคำขอระหว่าง Claude ตรวจนานๆ) และ claim ทุก 15 วินาทีเมื่อว่าง
- ต่อหนึ่งคำขอ (`carry_out` ใน `runner.py`): รายงาน `running` → ดาวน์โหลด skill ที่ตรึงไว้ แตก zip ไปที่
  `<งาน>/.claude/skills/<name>/` (ตรวจ checksum และปฏิเสธ path ที่มี `..`) → ดาวน์โหลด SOC/หลักฐานไป `<งาน>/inputs/`
  (ตรวจ checksum) → รัน `claude -p` ในโฟลเดอร์งาน ให้เขียน `out/results.json` และ `out/SOC_Check.docx`
  → submit พร้อม `model` (โมเดลที่เขียนมากที่สุดใน `modelUsage`) และ `skillVersion` (header `X-Soc-Skill-Version`)
- prompt มี `SOC_RUNNER_HEADLESS=1`, ข้อใหญ่, โฟลเดอร์ output และ `acknowledged_missing` ตามสัญญาใน `docs/SOC-SKILL-HOSTING.md`
  และชี้ไปที่ skill ในโฟลเดอร์งานตรงๆ (กันชนกับ skill ชื่อเดียวกันที่ผู้ตรวจติดตั้งไว้เอง)
- `claude -p --output-format json --model sonnet --permission-mode acceptEdits --allowedTools Bash,Read,Write,Edit,Glob,Grep,Skill,TodoWrite --disallowedTools WebFetch,WebSearch`
  ใต้ login Claude ของผู้ใช้เครื่องนั้น สคริปต์ของ skill ต้องการ Python ที่มี python-docx / PyMuPDF บนเครื่อง (ตัวติดตั้งต้องจัดให้, ticket 16)
- ผลลัพธ์: ส่งสำเร็จ → ลบโฟลเดอร์งาน / ล้มเหลว (ดาวน์โหลดไม่ครบ, Claude error, ไม่มี results.json หรือ SOC_Check)
  , server ตอบ error ระหว่างตรวจ หรือ runner ผิดพลาดเอง → รายงาน `failed` พร้อมเหตุผลภาษาไทย และเก็บโฟลเดอร์ไว้ดู
  / `409 NOT_CLAIMED` (ยกเลิกหรือหมดเวลา) → ลบโฟลเดอร์แล้วข้ามไปเงียบๆ
  / submit ถูกปฏิเสธ → server ปิดเป็น `failed` เองแล้ว runner ไม่รายงานซ้ำ (เก็บโฟลเดอร์ไว้ดู)
- `401` → บอกให้ดาวน์โหลดไฟล์เชื่อมใหม่ / `403` → บอกว่าไม่มีสิทธิ์ SOC แล้ว ทั้งคู่ลองใหม่ทุก 60 วินาที
- ความเสี่ยงที่รู้อยู่: skill ต้องใช้ Bash รันสคริปต์ Python ของตัวเอง จึงเปิด Bash ไว้ทั้งหมด PDF ของผู้ขายเป็นข้อมูลที่ไม่น่าเชื่อถือ
  (prompt injection) ปิด WebFetch/WebSearch แล้ว แต่ยังไม่ได้จำกัดคำสั่ง Bash
- ตัวแปร: `SOC_RUNNER_WORK_DIR` (ค่าเริ่มต้น `%LOCALAPPDATA%\SOCRunner\work`), `SOC_RUNNER_MODEL` (`sonnet`),
  `SOC_RUNNER_TIMEOUT_MINUTES` (180), `SOC_RUNNER_CA_FILE` (root CA ของ Caddy `tls internal`)
- ยังไม่ทำ (ticket 15): `needs_documents`, `paused_quota`, `needs_login` และการตรวจสถานะ login ของ Claude
  (heartbeat ส่ง `claudeLogin: "unknown"`)

## Admin

หน้า **Admin Center → SOC Runner** (`/admin/soc-runners`) แสดงทุกลิงก์ ทั้งที่ใช้งานอยู่และที่ยกเลิกแล้ว
พร้อมสถานะ เวลาที่เห็นล่าสุด และเวอร์ชัน ปุ่ม **ยกเลิกลิงก์** ใช้เมื่อเครื่องหายหรือเปลี่ยนผู้ใช้ เครื่องนั้นถูกปฏิเสธตั้งแต่ request ถัดไป
และหน้า `/soc` ของผู้ใช้คนนั้นขึ้นว่า "ลิงก์ของเครื่องคุณถูกยกเลิก" จนกว่าจะดาวน์โหลดไฟล์เชื่อมใหม่

Audit (ประวัติกิจกรรม): `SOC_RUNNER_LINKED` (ดาวน์โหลด, มี `replacedLinkIds`), `SOC_RUNNER_REVOKED` (admin ยกเลิก)
บันทึกใน transaction เดียวกับการเปลี่ยนลิงก์

ลิงก์ที่ใช้ได้หนึ่งลิงก์ต่อผู้ใช้ (ADR 0008) บังคับด้วย transaction แบบ Serializable (retry 3 ครั้ง) ไม่มี partial unique index
เพราะ Prisma schema แสดง index แบบมีเงื่อนไขไม่ได้ และ `migrate dev` ครั้งถัดไปจะพยายามลบทิ้ง
