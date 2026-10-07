# SOC Runner: ลิงก์ โทเคน heartbeat และคำขอตรวจ

> ADR 0008, ticket 12 — โค้ดอยู่ที่ `lib/soc-runner.ts`, `app/api/soc/runner-link/route.ts`,
> `app/api/soc-runner/heartbeat/route.ts`
> ticket 13 (คำขอตรวจ + claim/ดาวน์โหลด/รายงาน/ส่งผล) — `lib/soc-check-requests.ts`, `actions/socCheckRequests.ts`,
> `app/api/soc-runner/claim`, `app/api/soc-runner/requests/[id]/*`

## ผู้ใช้เชื่อมเครื่อง

หน้า `/soc` มีกล่อง **SOC Runner ของคุณ** แสดงสถานะ (ออนไลน์ / ออฟไลน์ / ยังไม่เคยเชื่อมต่อ / ยังไม่ได้เชื่อมเครื่อง)
เวลาที่เห็นล่าสุด เวอร์ชันของ runner และสถานะการเข้าสู่ระบบ Claude

ปุ่ม **ดาวน์โหลดไฟล์เชื่อม SOC Runner** (`POST /api/soc/runner-link`, ต้องมีสิทธิ์ `soc`) สร้างไฟล์ `soc-runner.json`
ที่ผูกกับบัญชีผู้ใช้ที่ล็อกอินอยู่ ไม่ต้องใส่รหัสจับคู่ ใช้กับ SOC Runner ที่รันจาก source ผู้ตรวจทั่วไปใช้**ตัวติดตั้ง**แทน (หัวข้อ "ตัวติดตั้ง" ด้านล่าง)
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

โปรแกรม Python (standard library ล้วน) ผู้ตรวจติดตั้งด้วยตัวติดตั้ง (ticket 16) นักพัฒนารันจาก source ได้

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
- `claude -p --output-format stream-json --verbose --model sonnet --permission-mode acceptEdits --allowedTools Bash,PowerShell,Read,Write,Edit,Glob,Grep,Skill,TodoWrite --disallowedTools WebFetch,WebSearch`
  พร้อม `--session-id <uuid>` (รอบแรก) หรือ `--resume <uuid>` (ตรวจต่อ)
  (บน Windows Claude Code รันคำสั่ง shell ผ่าน tool `PowerShell` ไม่ใช่ `Bash` ถ้าไม่อนุญาต ทุกคำสั่ง `python` จะติด "requires approval" แล้วหยุด)
  ใต้ login Claude ของผู้ใช้เครื่องนั้น สคริปต์ของ skill ต้องการ Python ที่มี python-docx / PyMuPDF: runner ใส่โฟลเดอร์ของ Python ที่ตัวเองรันอยู่
  ไว้หน้าสุดของ PATH ของ `claude` (ตัวติดตั้งให้ Python ที่มี package เหล่านี้) และรัน `claude` แบบไม่เปิดหน้าต่าง console
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

## ตัวติดตั้ง (ticket 16, `soc-runner/installer/`)

ผู้ตรวจกด **ดาวน์โหลดตัวติดตั้ง SOC Runner** ในหน้า `/soc` (`POST /api/soc/runner-installer`, ต้องมีสิทธิ์ `soc`)
ได้ `SOCRunnerSetup.exe` ที่มีไฟล์เชื่อมของผู้ใช้คนนั้น (โทเคนใหม่) แนบท้ายไฟล์ จึงไม่ต้องจับคู่เครื่อง
การดาวน์โหลดสร้างลิงก์ใหม่และยกเลิกลิงก์เดิม (`replaced`) เหมือนดาวน์โหลดไฟล์เชื่อม ถ้า server ยังไม่มีตัวติดตั้ง ตอบ `503`
และ**ไม่**แตะลิงก์เดิม หน้า `/soc` อธิบายคำเตือนของเบราว์เซอร์และ SmartScreen เป็นภาษาไทย (ตัวติดตั้งไม่ได้ลงลายเซ็น, ADR 0008)

รูปแบบไฟล์ที่ดาวน์โหลด (`lib/soc-runner-installer.ts`):
`<SOCRunnerSetup.exe> <JSON ไฟล์เชื่อม UTF-8> <ความยาว JSON uint32 LE> "SOCRCFG1"`

### ติดตั้งแล้วเกิดอะไรขึ้น (ไม่ใช้สิทธิ์ admin ทุกขั้น ทุกอย่างอยู่ใน `%LOCALAPPDATA%\SOCRunner`)

1. ตัว `.exe` (C# `SocRunnerSetup.cs`, manifest `asInvoker`) อ่านไฟล์เชื่อมท้ายไฟล์ตัวเอง ไม่มี = บอกให้ดาวน์โหลดจาก `/soc`
2. ปิด SOC Runner ตัวเดิม (python/pythonw/SOCRunner ที่รันจาก `app\` พร้อม process ลูก เช่น `claude` ที่กำลังตรวจ)
3. แตก payload เป็นโฟลเดอร์ `app\` ใหม่ทั้งหมด (`app\python\` = Python 3.12 จาก NuGet + python-docx/PyMuPDF/openpyxl,
   `app\runner\` = โค้ด runner) แล้วเขียน `soc-runner.json` **ติดตั้งซ้ำ = ซ่อม** เพราะ `app\` ถูกแทนทั้งชุด
   ส่วน `work\` (งานที่หยุดรอโควตา) และ `runner.log` ไม่ถูกลบ
4. รัน `app\python\python.exe app\runner\install.py <root>` (`soc-runner/install.py`):
   - ตรวจไฟล์เชื่อม
   - ถ้ายังไม่มี Claude Code ที่ใช้ได้ (PATH หรือ `%USERPROFILE%\.local\bin\claude.exe`, ทดสอบด้วย `--version`)
     ดาวน์โหลด native build จาก `downloads.claude.ai` ตรวจ sha256 กับ manifest แล้ว `claude.exe install stable`
     (ขั้นตอนเดียวกับ `claude.ai/install.ps1` แต่ไม่รันไฟล์ `.ps1` จึงไม่ติด Execution Policy)
   - **ไม่ติดตั้ง Git**: Claude Code 2.1.292 รัน `claude -p` ได้โดยไม่มี Git และ bash ใน PATH และเรียก `python` ผ่าน shell tool ได้ (ทดสอบ 2026-10-07) บน Windows ใช้ tool PowerShell
   - เพิ่มโฟลเดอร์ของ `claude.exe` ใน PATH ของผู้ใช้ (HKCU\Environment) ถ้ายังไม่มี เพื่อให้พิมพ์ `claude` แล้ว `/login` ได้
     ตอน login หมดอายุ (ปัญหาเดิมใน `Problem/install-claude-code-no-admin.md`)
   - ตั้ง autostart: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` ค่า `SOCRunner` =
     `"…\app\python\SOCRunner.exe" "…\app\runner\runner.py" "…\soc-runner.json" "--log" "…\runner.log"`
   - ถ้า `claude auth status` บอกว่ายังไม่ได้ login เปิดหน้าต่าง `claude auth login --claudeai` (เปิดเบราว์เซอร์ให้) รอสูงสุด 15 นาที
     ถ้า login อยู่แล้ว (เช่น ติดตั้งซ้ำ) ข้ามขั้นนี้
   - เริ่ม runner ด้วย `SOCRunner.exe` (สำเนาของ `pythonw.exe` ชื่อนี้ให้เห็นใน Task Manager ไม่มีหน้าต่าง) ถ้ามีอีกตัวทำงานอยู่ ตัวใหม่จะจบเองเพราะ `runner.lock`
5. แสดงกล่อง "ติดตั้ง SOC Runner เสร็จแล้ว" (บอกให้ลบ `SOCRunnerSetup.exe` ที่ดาวน์โหลดไว้ เพราะมีโทเคนของผู้ใช้
   ใครเอาไปติดตั้งก็รับงานในนามผู้ใช้นั้นได้) หรือเหตุผลที่ไม่สำเร็จ (รายละเอียดอยู่ในหน้าต่าง console)

ข้อควรรู้: ลิงก์เดิมถูกยกเลิกตอน**ดาวน์โหลด** ไม่ใช่ตอนติดตั้ง ถ้าดาวน์โหลดแล้วไม่ติดตั้ง หรือติดตั้งไม่สำเร็จ เครื่องเดิมจะรับงานไม่ได้
จนกว่าจะติดตั้งไฟล์ใหม่ให้สำเร็จ (ตามการตัดสินใจ "หนึ่งลิงก์ต่อผู้ใช้" ใน ADR 0008) ลิงก์ "ดาวน์โหลดเฉพาะไฟล์เชื่อม" ในหน้า `/soc`
แสดงเฉพาะ ADMIN (นักพัฒนาที่รันจาก source) เพื่อไม่ให้ผู้ตรวจกดแล้วเครื่องที่ติดตั้งไว้หลุดโดยไม่ตั้งใจ

ดูปัญหาบนเครื่องผู้ตรวจ: `%LOCALAPPDATA%\SOCRunner\runner.log`
ถอนการติดตั้ง (ยังไม่มีปุ่ม): ลบค่า `SOCRunner` ใน `HKCU\…\Run`, ปิด `SOCRunner.exe` ใน Task Manager แล้วลบ `%LOCALAPPDATA%\SOCRunner`
(Claude Code และ login ของผู้ใช้ไม่ถูกลบ) แล้วให้ admin ยกเลิกลิงก์ที่ `/admin/soc-runners`

### Build และนำขึ้น server

```
npm run soc:runner:build      # = python soc-runner/installer/build.py → soc-runner/dist/SOCRunnerSetup.exe (~39 MB)
```

ต้อง build บน Windows (ใช้ `csc.exe` ของ .NET Framework 4.x ที่มากับ Windows) ต้องมีอินเทอร์เน็ตครั้งแรก
(NuGet `python` 3.12.10 ตรึง sha256 ไว้, PyPI ตาม `installer/requirements.txt`) ผลลัพธ์อยู่ใน `.gitignore`
แก้โค้ด runner แล้วต้อง build และนำขึ้นใหม่ ผู้ตรวจได้เวอร์ชันใหม่เมื่อติดตั้งซ้ำ (ยังไม่มีการอัปเดตเอง)

server หาไฟล์ที่ `SOC_RUNNER_INSTALLER_PATH` หรือค่าเริ่มต้น `<SOC_STORAGE_ROOT>/runner/SOCRunnerSetup.exe`

**Server แบบ native บน Windows (`docs/DEPLOY-WINDOWS.md`, ที่ใช้จริง: ไม่มี Docker เพราะ IT ปิด virtualization ไว้ทุกเครื่อง)**
build บนเครื่องนักพัฒนา แล้ว copy ไฟล์ไปไว้ใต้ `SOC_STORAGE_ROOT` ของ server (ค่าใน `.env` เช่น `C:\expense-billing-data\soc`)
ไม่ต้อง restart แอป ปุ่มดาวน์โหลดขึ้นเองเมื่อมีไฟล์

```powershell
New-Item -ItemType Directory -Force C:\expense-billing-data\soc\runner
Copy-Item soc-runner\dist\SOCRunnerSetup.exe C:\expense-billing-data\soc\runner\SOCRunnerSetup.exe
```

- `SOC_RUNNER_SERVER_URL`: ไม่ต้องตั้งถ้าผู้ตรวจเปิดเว็บด้วย address เดียวกับที่ runner จะเรียก (เช่น `http://192.168.51.43:3000`)
  ไฟล์เชื่อมใช้ origin ของหน้าที่ดาวน์โหลด ตั้งเฉพาะเมื่อผู้ตรวจเข้าเว็บด้วย address ที่เครื่องอื่นเรียกไม่ถึง (เช่น `localhost`)
- `SOC_RUNNER_CA_CERT_FILE`: ไม่ต้องตั้ง วิธี native ไม่มี HTTPS ให้ runner จึงคุยกับ server แบบ `http://`
  (โทเคนของ runner วิ่งในวง LAN แบบไม่เข้ารหัส เหมือน session cookie ของเว็บ ดูหมายเหตุ HTTPS ใน `DEPLOY-WINDOWS.md`)
  ใช้เมื่อวันหนึ่งมี reverse proxy ที่ใช้ certificate จาก CA ภายในที่ Windows ของผู้ตรวจยังไม่เชื่อ

**ถ้าใช้ docker-compose (`DEPLOY.md`, ใช้ไม่ได้บนเครื่องของบริษัทตอนนี้)** วางไฟล์ใน volume `soc_data`
(`docker compose exec app mkdir -p /data/soc/runner` แล้ว `docker compose cp soc-runner/dist/SOCRunnerSetup.exe app:/data/soc/runner/`)
ตั้ง `SOC_RUNNER_SERVER_URL` เป็น URL ของ Caddy เช่น `https://192.168.51.43` และ `SOC_RUNNER_CA_CERT_FILE` เป็น root CA ของ Caddy
`tls internal` (mount volume `caddy_data` แบบ read-only แล้วชี้ไปที่ `.../caddy/pki/authorities/local/root.crt`)
ไฟล์เชื่อมทุกไฟล์จะมี `caCert` ถ้าตั้งค่านี้แต่ไฟล์ไม่ใช่ PEM การดาวน์โหลดจะล้มเหลว (500) โดยไม่แตะลิงก์เดิม

## Admin

หน้า **Admin Center → SOC Runner** (`/admin/soc-runners`) แสดงทุกลิงก์ ทั้งที่ใช้งานอยู่และที่ยกเลิกแล้ว
พร้อมสถานะ เวลาที่เห็นล่าสุด และเวอร์ชัน ปุ่ม **ยกเลิกลิงก์** ใช้เมื่อเครื่องหายหรือเปลี่ยนผู้ใช้ เครื่องนั้นถูกปฏิเสธตั้งแต่ request ถัดไป
และหน้า `/soc` ของผู้ใช้คนนั้นขึ้นว่า "ลิงก์ของเครื่องคุณถูกยกเลิก" จนกว่าจะดาวน์โหลดไฟล์เชื่อมใหม่

Audit (ประวัติกิจกรรม): `SOC_RUNNER_LINKED` (ดาวน์โหลด, มี `replacedLinkIds`), `SOC_RUNNER_REVOKED` (admin ยกเลิก)
บันทึกใน transaction เดียวกับการเปลี่ยนลิงก์

ลิงก์ที่ใช้ได้หนึ่งลิงก์ต่อผู้ใช้ (ADR 0008) บังคับด้วย transaction แบบ Serializable (retry 3 ครั้ง) ไม่มี partial unique index
เพราะ Prisma schema แสดง index แบบมีเงื่อนไขไม่ได้ และ `migrate dev` ครั้งถัดไปจะพยายามลบทิ้ง
