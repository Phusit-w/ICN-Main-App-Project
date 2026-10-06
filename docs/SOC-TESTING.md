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
- process ที่รันเทสต์ไม่โหลด `.env` และ `test/register.mjs` เขียนทับ `DATABASE_URL` ด้วย address ที่เชื่อมต่อไม่ได้
  ก่อนโหลดโค้ดของแอป เทสต์ที่ลืมใส่ `{ skip }` จึง error ทันที ไม่หลุดไปเขียนฐานข้อมูลจริง
  (ยกเว้นตอน `prisma migrate deploy` ที่ `prisma.config.ts` โหลด `.env` เอง แต่ไม่ทับ `DATABASE_URL` ที่ harness ส่งให้)
- `TEST_DATABASE_URL` ต้องชี้ไปที่ `localhost`/`127.0.0.1` เท่านั้น ถ้าชี้ไปเครื่องอื่น เช่น server จริง
  harness จะปฏิเสธทันที (ใส่ `?host=`/`?hostaddr=` เพื่อเลี่ยงก็ไม่ได้)

## เขียนเทสต์ที่ใช้ฐานข้อมูล

`test/register.mjs` ผูก `@/lib/prisma` เข้ากับ schema ของรอบนั้นไว้ก่อนที่ไฟล์เทสต์ใดๆ จะโหลด
ดังนั้นโค้ดที่ถูกเทสต์ (server action, route handler, store) ใช้ฐานข้อมูลเทสต์ได้เลย ไม่ต้องแก้โค้ดของแอป
เรียก `setupTestDatabase()` ครั้งเดียวที่หัวไฟล์ ฟังก์ชันนี้จะล้างทุกตารางก่อนแต่ละเทสต์ และคืนค่า `skip`
ไว้ใส่ให้เทสต์ที่ต้องใช้ฐานข้อมูล จากนั้นแต่ละเทสต์สร้างข้อมูลที่ต้องใช้เอง
ดูตัวอย่างได้ที่ `test/harness.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

test("…", { skip }, async () => {
  await prisma.socJob.create({ data: { /* … */ } });
  // เรียกโค้ดที่ต้องการเทสต์ผ่าน interface ภายนอก แล้ว assert ผลลัพธ์
});
```

## โค้ดที่ import `next/*`

import `next/server`, `next/cache`, `next/headers`, `next/navigation` ได้ตามปกติ (resolve hook เติม `.js` ให้)
`NextResponse` ใช้ได้เลย แต่ API ที่ต้องอยู่ใน request ของ Next เช่น `revalidatePath()`, `cookies()` และ `redirect()`
จะ throw เมื่อเรียกนอก request ให้ stub ด้วย `t.mock.module(...)` **ก่อน** dynamic-import โมดูลที่จะเทสต์
(`npm test` เปิด `--experimental-test-module-mocks` ไว้แล้ว)

```ts
test("…", { skip }, async (t) => {
  t.mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
  const { importLocalCheckRun } = await import("@/actions/soc");
  // …
});
```

ไฟล์ `.tsx` (JSX) โหลดในเทสต์ไม่ได้ เพราะ Node ตัดได้แค่ type แต่แปลง JSX ไม่ได้ ให้เทสต์ผ่าน action, route handler หรือ `lib/`

## Model ใหม่

ถ้าเทสต์ต้องเพิ่ม model ใหม่ ให้สร้าง migration ตามปกติก่อน (`npx prisma migrate dev`)
`npm test` รอบถัดไปจะ migrate schema ใหม่ให้เอง
