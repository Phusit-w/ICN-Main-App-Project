# วิธีรันเทสต์ TypeScript (`npm test`)

เทสต์ฝั่งเว็บใช้ test runner ที่มากับ Node (`node:test` + `node:assert`) ไม่มีไลบรารีเทสต์เพิ่ม
Node 24 รันไฟล์ `.ts` ได้เอง (type stripping) ส่วน `@/` alias กับ import แบบไม่ใส่นามสกุลจัดการโดย
`test/resolve-ts.mjs` เทสต์ Python ของ SOC worker ยังรันด้วย `npm run soc:test` เหมือนเดิม

## ตั้งค่าครั้งแรก

1. สร้างไฟล์ `.env.test` จากตัวอย่าง (ไฟล์นี้ถูก gitignore)

   ```powershell
   Copy-Item .env.test.example .env.test
   ```

2. สตาร์ท Postgres สำหรับเทสต์โดยเฉพาะ ชื่อ `test-db` แยกจาก `pilot-db` ของ dev
   ปล่อยหน้าต่างนี้ค้างไว้ หรือรันเป็น background

   ```powershell
   npx.cmd prisma dev --name test-db -P 51228 --shadow-db-port 51229 -p 51227
   ```

   ครั้งต่อไปใช้ `npx.cmd prisma dev start test-db` ได้ ถ้าสถานะค้างที่ `not_running` ให้กลับไปใช้คำสั่งเต็มด้านบน

## รันเทสต์

```powershell
npm.cmd test
```

คำสั่งนี้หาไฟล์ `*.test.ts` ใต้ `test/`, `lib/`, `actions/` และ `app/` แล้วรันทีละไฟล์ (`--test-concurrency=1`)
เพราะทุกไฟล์ใช้ฐานข้อมูลชุดเดียวกัน ถ้าจะรันไฟล์เดียว ให้ใช้ flag ชุดเดียวกับใน `package.json`
แล้วเปลี่ยน pattern ท้ายคำสั่งเป็นชื่อไฟล์นั้น

ถ้าไม่ได้ตั้ง `TEST_DATABASE_URL` เทสต์ที่ต้องใช้ฐานข้อมูลจะถูก **skip** และมีคำเตือน ⚠ ขึ้นตอนเริ่ม
ส่วนเทสต์ที่ไม่ใช้ฐานข้อมูลยังรันตามปกติ

## ข้อมูล dev/prod ปลอดภัยอย่างไร

- รัน `npm test` หนึ่งครั้ง จะได้ schema ใหม่ของตัวเองบน `TEST_DATABASE_URL` ชื่อ `test_run_<เวลา>_<สุ่ม>`
  `test/global-setup.mjs` สร้าง schema นี้แล้วรัน `prisma migrate deploy` ลงไป และลบทิ้งเมื่อรันจบ
  schema `test_run_*` ที่ค้างจากรอบที่ถูก kill กลางทาง จะถูกลบตอนเริ่มรอบถัดไป
- เทสต์ไม่อ่าน `.env` เลย และ `test/register.mjs` ลบ `DATABASE_URL` ออกจาก environment
  ก่อนโหลดโค้ดของแอป
- `TEST_DATABASE_URL` ต้องชี้ไปที่ `localhost`/`127.0.0.1` เท่านั้น ถ้าชี้ไปเครื่องอื่น เช่น server จริง
  harness จะปฏิเสธทันที

## เขียนเทสต์ที่ใช้ฐานข้อมูล

`test/register.mjs` ผูก `@/lib/prisma` เข้ากับ schema ของรอบนั้นไว้ก่อนที่ไฟล์เทสต์ใดๆ จะโหลด
ดังนั้นโค้ดที่ถูกเทสต์ (server action, route handler, store) ใช้ฐานข้อมูลเทสต์ได้เลย ไม่ต้องแก้โค้ดของแอป
ล้างข้อมูลด้วย `resetDatabase()` ใน `beforeEach` แล้วสร้างข้อมูลที่เทสต์ต้องใช้เอง
ดูตัวอย่างได้ที่ `test/harness.test.ts`

```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { hasTestDatabase, resetDatabase } from "@/test/db";

const skip = hasTestDatabase() ? false : "TEST_DATABASE_URL not set — see docs/SOC-TESTING.md";

beforeEach(async () => {
  if (hasTestDatabase()) await resetDatabase();
});

test("…", { skip }, async () => {
  await prisma.socJob.create({ data: { /* … */ } });
  // เรียกโค้ดที่ต้องการเทสต์ผ่าน interface ภายนอก แล้ว assert ผลลัพธ์
});
```

ถ้าเทสต์ต้องเพิ่ม model ใหม่ ให้สร้าง migration ตามปกติก่อน (`npx prisma migrate dev`)
`npm test` รอบถัดไปจะ migrate schema ใหม่ให้เอง
