# SOC Runner: ลิงก์ โทเคน และ heartbeat

> ADR 0008, ticket 12 — โค้ดอยู่ที่ `lib/soc-runner.ts`, `app/api/soc/runner-link/route.ts`,
> `app/api/soc-runner/heartbeat/route.ts` ส่วน claim/ดาวน์โหลด/รายงานผล เป็นของ ticket 13

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

ทุก endpoint ของ runner อยู่ใต้ `/api/soc-runner/` ซึ่ง `proxy.ts` ปล่อยผ่านโดยไม่ต้องมี session cookie
แต่ละ route ตรวจ `Authorization: Bearer <token>` เองผ่าน `authenticateSocRunner()`

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

## Admin

หน้า **Admin Center → SOC Runner** (`/admin/soc-runners`) แสดงทุกลิงก์ ทั้งที่ใช้งานอยู่และที่ยกเลิกแล้ว
พร้อมสถานะ เวลาที่เห็นล่าสุด และเวอร์ชัน ปุ่ม **ยกเลิกลิงก์** ใช้เมื่อเครื่องหายหรือเปลี่ยนผู้ใช้ เครื่องนั้นถูกปฏิเสธตั้งแต่ request ถัดไป

Audit (ประวัติกิจกรรม): `SOC_RUNNER_LINKED` (ดาวน์โหลด, มี `replacedLinkIds`), `SOC_RUNNER_REVOKED` (admin ยกเลิก)
