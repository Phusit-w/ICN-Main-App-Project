# วิธีเปิดเว็บ (local dev)

ขั้นตอนเปิดเว็บบนเครื่องตัวเองตั้งแต่เปิดเครื่องใหม่จนเข้าเว็บได้ ใช้ทุกครั้งที่จะเริ่มทำงาน

## ก่อนเริ่ม: PowerShell บล็อกคำสั่ง npm/npx

เครื่องนี้ตั้ง execution policy ของ PowerShell ไว้เข้มงวด ทำให้พิมพ์ `npm ...`/`npx ...` เฉยๆ แล้วเจอ error แบบ `is not digitally signed. You cannot run this script...` — สาเหตุคือ `npm`/`npx` มีทั้งไฟล์ `.cmd` (batch) และ `.ps1` (PowerShell script) อยู่ในโฟลเดอร์เดียวกัน พอพิมพ์ไม่ระบุนามสกุล PowerShell จะเลือกรัน `.ps1` ก่อนเสมอ ซึ่งไม่มีลายเซ็นดิจิทัลเลยโดนบล็อก

**วิธีแก้:** เติม `.cmd` ต่อท้ายทุกครั้งที่พิมพ์คำสั่ง — `.cmd` เป็นไฟล์ batch ธรรมดา ไม่ใช่สคริปต์ PowerShell จึงไม่โดน policy เช็ค รันได้เสมอ:

```powershell
npm.cmd install
npx.cmd prisma dev start pilot-db -P 51218 --shadow-db-port 51219
npm.cmd run dev
```

ทุกคำสั่งด้านล่างในเอกสารนี้ ถ้าเจอ error แบบเดียวกันให้เติม `.cmd` แบบนี้แทน

## ขั้นตอน

**0. ติดตั้ง dependencies — ทำครั้งแรกครั้งเดียวพอ**

ไม่ต้องรันซ้ำทุกครั้งที่เปิดเครื่อง เว้นแต่ `package.json` เปลี่ยน (เช่น มีคนเพิ่ม/ลบไลบรารี) หรือลบโฟลเดอร์ `node_modules` ทิ้งไป — ถ้าไม่แน่ใจว่าเคยรันหรือยัง ดูว่ามีโฟลเดอร์ `node_modules` อยู่ข้างๆ `package.json` ไหม มีแล้วข้ามขั้นตอนนี้ได้เลย

```powershell
cd "C:\Phusit\Claude Project\ICN Apps\Main_Project_Build_App"
npm.cmd install
```

**1. เปิด terminal (PowerShell) แล้วเข้าโฟลเดอร์โปรเจกต์**

ต้องเป็นโฟลเดอร์ `Main_Project_Build_App` ที่มี `package.json` อยู่ข้างใน (ไม่ใช่โฟลเดอร์แม่ `ICN Apps`) — ถ้า `cd` ผิดโฟลเดอร์แล้วรัน `npm run dev` จะเจอ error `ENOENT ... Could not read package.json`

```powershell
cd "C:\Phusit\Claude Project\ICN Apps\Main_Project_Build_App"
```

**2. สตาร์ท local database พร้อมปักหมุดพอร์ตให้คงที่**

```powershell
npx.cmd prisma dev start pilot-db -P 51218 --shadow-db-port 51219
```

ปล่อยหน้าต่างนี้ค้างไว้แบบ foreground หรือถ้าจะปิด terminal ทันทีให้เติม `-d` ท้ายคำสั่ง (รันแบบ background) ถ้าเจอข้อความ "already running" แปลว่ามีคนเปิดค้างไว้ให้แล้วจากก่อนหน้า ไม่ต้องทำอะไรเพิ่ม ข้ามไปข้อ 4 ได้เลย

**3. เช็คว่า DB ขึ้นจริง (ไม่บังคับ แต่เผื่อไม่ชัวร์)**

```powershell
npx.cmd prisma dev ls
```

ต้องเห็นบรรทัด `pilot-db  running` — ถ้าพอร์ตในนั้นไม่ใช่ 51218/51219 (แปลว่ามีโปรแกรมอื่นแย่งพอร์ตไปพอดี) ให้เปิด `.env` แก้ `DATABASE_URL`/`SHADOW_DATABASE_URL` ให้ตรงกับพอร์ตที่ขึ้นจริง (`SHADOW_DATABASE_URL` ใช้เฉพาะตอนรัน `npx prisma migrate dev` เพื่อสร้าง migration ใหม่ — เซิร์ฟเวอร์ `pilot-db` นี้ไม่รองรับ `CREATE DATABASE` แบบที่ Migrate ใช้สร้าง shadow db ชั่วคราวโดยปกติ เลยต้องชี้ไปที่พอร์ต shadow ที่ปักหมุดไว้แทน ดูคอมเมนต์ใน `prisma.config.ts`)

**4. รันเว็บแอป (terminal ใหม่อีกหน้าต่างก็ได้ — แยกจากข้อ 2)**

```powershell
cd "C:\Phusit\Claude Project\ICN Apps\Main_Project_Build_App"
npm.cmd run dev
```

**5. เปิดเบราว์เซอร์**

```
http://localhost:3000
```

โหมด dev นี้ข้ามระบบ login ไปอัตโนมัติ (ดูคอมเมนต์ใน `proxy.ts`) — เข้าเว็บได้เลยไม่ต้องกรอก username/password

## เช็กลิสต์ถ้าเปิดแล้ว error

| อาการ | สาเหตุที่เจอบ่อย | วิธีแก้ |
|---|---|---|
| `is not digitally signed. You cannot run this script...` | PowerShell execution policy บล็อกไฟล์ `.ps1` ของ npm/npx | เติม `.cmd` ต่อท้ายคำสั่ง (`npm.cmd`/`npx.cmd`) ดูหัวข้อด้านบน |
| `ENOENT ... Could not read package.json` | อยู่ผิดโฟลเดอร์ (ไม่ได้ `cd` เข้า `Main_Project_Build_App`) | `cd` เข้าโฟลเดอร์ที่ถูกต้องตามข้อ 1 ก่อน แล้วค่อยรันคำสั่ง |
| `PrismaClientKnownRequestError` ตอนเปิดหน้า | `pilot-db` ไม่ได้รันอยู่ | รันคำสั่งข้อ 2 ใหม่ |
| Error เดิมซ้ำแม้ DB รันอยู่แล้ว | `npm run dev` รันค้างมาตั้งแต่ก่อนแก้ `.env` / ก่อน DB ขึ้น | ปิด `npm run dev` เดิม แล้วรันข้อ 4 ใหม่ |
| พอร์ตใน `.env` ไม่ตรงกับที่ `prisma dev ls` แสดง | มีโปรแกรมอื่นแย่งพอร์ต 51218/51219 ไปพอดี (นานๆ ครั้ง) | แก้ `.env` ให้ตรงพอร์ตที่ขึ้นจริง แล้ว restart `npm run dev` |

ลำดับสำคัญคือ **ต้อง DB ขึ้นก่อน แล้วค่อย `npm run dev`** — และถ้าแก้ `.env` ทีไร ต้อง restart `npm run dev` ทุกทีด้วย

## Prisma Studio ขึ้น "Could not load schema metadata" ทั้งที่ `pilot-db` running อยู่

**สาเหตุที่เจอบ่อยที่สุด:** เปิด `npm run dev`/`npm run start` ค้างพร้อมกับ Prisma Studio (หรือเปิด Studio ซ้อนกันหลายหน้าต่าง/หลาย process) — `pilot-db` รับ connection พร้อมกันจากหลายทางไม่ดี พอชนกันหนักๆ ตัว `pilot-db` เองจะค้าง/ไม่ตอบสนองไปเลย (ไม่ใช่แค่ Studio อย่างเดียวที่ error — ต่อให้ query ธรรมดาก็ต่อไม่ติดเหมือนกัน)

**วิธีแก้ (ทำตามลำดับ):**

1. **ปิดหน้าต่าง terminal ทุกบานที่รัน `npm run dev`/`npm run start`/`prisma studio` ค้างอยู่** ปิดทั้งหน้าต่างเลย (ปิดแค่แท็บเบราว์เซอร์ไม่พอ ตัว process เบื้องหลังอาจยังค้าง) ไม่แน่ใจว่าเหลือค้างไหม เปิด Task Manager เช็คว่ามี process ชื่อ `node.exe` เหลืออยู่กี่ตัว ปิดตัวที่ไม่ได้ใช้แล้วทั้งหมด

2. **Restart `pilot-db` ให้สะอาด**:
   ```powershell
   npx.cmd prisma dev stop pilot-db
   npx.cmd prisma dev start pilot-db -P 51218 --shadow-db-port 51219
   ```

3. เปิด Prisma Studio **อันเดียว** ใหม่:
   ```powershell
   npx.cmd prisma studio
   ```

ข้อมูลเดิมในฐานข้อมูลไม่หายไปไหนจากการ restart นี้ (แค่รีสตาร์ทตัวเซิร์ฟเวอร์ ไม่ใช่ลบข้อมูล) — และย้ำเรื่องเดิม: **อย่าเปิด `npm run dev`/`start` พร้อมกับ Prisma Studio** เลือกเปิดทีละอันเสมอตอนใช้ `pilot-db` (ข้อจำกัดนี้จะหายไปเองตอน deploy ขึ้น PostgreSQL จริงบนเซิร์ฟเวอร์ — ดู `DEPLOY-WINDOWS.md`)
