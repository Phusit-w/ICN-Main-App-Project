# การ Deploy บนเซิร์ฟเวอร์ Windows แบบ Native (ไม่ใช้ Docker)

ใช้วิธีนี้แทน `DEPLOY.md` (Docker) เนื่องจากเซิร์ฟเวอร์/เครื่องเป้าหมายไม่รองรับ hardware virtualization (VT-x/AMD-V ปิดอยู่ที่ BIOS) ทำให้ Docker Desktop รันไม่ได้เลยไม่ว่าจะใช้ backend แบบไหน

ไฟล์ Docker (`Dockerfile`, `docker-compose.yml`, `DEPLOY.md`) ยังเก็บไว้เหมือนเดิมในโปรเจกต์ — ถ้า IT เปิด virtualization ให้ในอนาคตก็สลับไปใช้วิธีนั้นได้ทันทีโดยไม่ต้องแก้โค้ด

แนวทาง: รัน PostgreSQL แบบติดตั้งตรงบน Windows + รันแอปด้วย Node.js ตรงๆ มีให้เลือก 2 วิธีตามสิทธิ์ที่มีบนเครื่อง:

| | วิธี A: ไม่มีสิทธิ์ Administrator | วิธี B: มีสิทธิ์ Administrator |
|---|---|---|
| กลไก | `run-loop.ps1` (auto-restart) + shortcut ใน Startup folder (auto-start) | Windows Service จริงผ่าน NSSM |
| เริ่มทำงานตอนไหน | หลัง user account นี้ **login** เข้า Windows | ตั้งแต่ **ก่อน** ใคร login (boot เสร็จก็รันเลย) |
| auto-restart ถ้าแอปล่ม | ✅ (loop script) | ✅ (NSSM) |
| ต้องใช้สิทธิ์ | ไม่ต้อง | ต้อง (สร้าง service ต้อง admin) |
| มองเห็นใน `Get-Service` | ❌ | ✅ |

ถ้าไม่แน่ใจว่ามีสิทธิ์ admin บนเครื่องเป้าหมายไหม ตรวจสอบด้วย:

```powershell
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

## ขั้นตอนที่ทำเหมือนกันทั้ง 2 วิธี

### สิ่งที่ต้องมีบนเซิร์ฟเวอร์

**สเปกเครื่อง (ขอจาก IT):** CPU 8 core / RAM 16 GB / Storage 1 TB — เกินความต้องการจริงของแอปนี้มาก (ขั้นต่ำจริงๆ ประมาณ 2-4 core / 8GB / 40-50GB ก็พอ) แต่ขอเผื่อไว้เพราะเป็น Fixed partition ขอเพิ่มทีหลังยาก

**Service ที่ต้องติดตั้ง (2 ตัว — ไม่มีอย่างอื่นแล้ว):**
- [Node.js **24.x (LTS)**](https://nodejs.org/) — เวอร์ชันอื่นอาจใช้ไม่ได้: Next.js 16 ต้องการ >= 20.9.0, Prisma 7 ต้องการเฉพาะช่วง 20.19+/22.12+/24.0+ เท่านั้น (21.x, 23.x ใช้ไม่ได้)
- [PostgreSQL **16.x** for Windows](https://www.postgresql.org/download/windows/) — ตัวติดตั้งของ EDB จะลงเป็น Windows Service ให้อัตโนมัติ (ขั้นตอนนี้ต้อง admin เสมอไม่ว่าจะเลือกวิธี A หรือ B ในการรันตัวแอปเอง — ปกติ IT เป็นคนติดตั้ง PostgreSQL ให้ครั้งเดียว)
- ปุ่ม "ดาวน์โหลดผลตรวจ (Excel)" ในหน้างานตรวจ SOC สร้างไฟล์ใน Node (`exceljs`) ไม่ต้องใช้ Python บน server (ตั้งแต่ 2026-10-08 ซึ่งเอาปุ่ม "ดาวน์โหลด SOC_Check" แบบ Word ออก Python และค่า `SOC_PYTHON` ที่เคยติดตั้งไว้ให้ปุ่มนั้นไม่ถูกใช้แล้ว)
- สำหรับปุ่ม "สร้างคำสั่งติดตั้ง SOC Runner" ในหน้า `/soc`: ไม่ต้อง build อะไรบน server แต่ครั้งแรกต้องเพิ่ม `SOC_RUNNER_SERVER_URL` และ `SOC_RUNNER_CA_CERT_FILE` (cert self-signed ของ IIS export เป็น PEM) ใน `.env` ดูคำสั่งใน "ติดตั้ง" ของ `docs/SOC-RUNNER.md`
- ถ้าต้องอ่าน PDF สแกน: ติดตั้ง Tesseract OCR พร้อม language data `tha` และ `eng` แล้วตั้ง `SOC_OCR_PROVIDER=tesseract`; หากยังไม่พร้อมให้คง `disabled` เพื่อ fail closed

Prisma/Next.js/ไลบรารีอื่นๆ ของแอป **ไม่ต้องติดตั้งแยก** — มากับไฟล์ที่ build เสร็จแล้วในตัวแอปเองทั้งหมด (ดู `FAQ.md`)

### 1. เตรียมฐานข้อมูล

เปิด `psql` หรือ pgAdmin ที่มากับตัวติดตั้ง PostgreSQL แล้วสร้าง database + user (เปลี่ยนรหัสผ่านให้ปลอดภัยจริง):

```sql
CREATE USER expense_billing WITH PASSWORD 'ใส่รหัสผ่านที่ปลอดภัย';
CREATE DATABASE expense_billing OWNER expense_billing;
```

### 2. เอาโค้ดเข้าเซิร์ฟเวอร์

**แนะนำ: วิธี Git** (แก้ปัญหา "stale files" ที่เจอมาแล้วตอนใช้ zip — ไฟล์ที่ถูก rename/ลบระหว่างเวอร์ชันจะไม่ตกค้าง, rollback ก็แค่ `git checkout` commit เดิม) — ทำครั้งแรกตามหัวข้อ **"ตั้งเซิร์ฟเวอร์ใหม่ด้วย Git (ทำครั้งเดียว)"** ท้ายเอกสารนี้ ได้โฟลเดอร์ `C:\Apps\expense-billing-app-deploy-git` (หรือชื่อที่ตั้งไว้) แล้วใช้โฟลเดอร์นั้นแทนที่ `C:\apps\expense-billing-app` ในทุกคำสั่งของเอกสารนี้ที่เหลือ

**ทางเลือกเดิม (ยังใช้ได้ ไม่แนะนำสำหรับเซิร์ฟเวอร์ใหม่):** คัดลอกทั้งโฟลเดอร์ `expense-billing-app/` ไปยังเซิร์ฟเวอร์ตรงๆ เช่น `C:\apps\expense-billing-app` (zip + extract) — ถ้าเวอร์ชันใหม่มีการ rename/ย้าย/ลบไฟล์ ต้องลบไฟล์เก่าที่ตกค้างเองก่อน extract ทับ ไม่งั้น build จะพังแบบ "two parallel pages that resolve to the same path" — ดู `git diff --diff-filter=D --name-only <เวอร์ชันเดิม> <เวอร์ชันใหม่>` เพื่อหารายชื่อไฟล์ที่ต้องลบ

### 3. ติดตั้ง dependencies

```powershell
cd C:\apps\expense-billing-app
npm ci
```

### 4. ตั้งค่า `.env` สำหรับรัน migration

```powershell
Copy-Item .env.production.example .env
notepad .env   # แก้ DATABASE_URL ให้เป็นรหัสผ่านจริงจากขั้นตอนที่ 1, และตั้ง SESSION_SECRET (คีย์เซ็น session cookie ของระบบ login รายคน — ดูคอมเมนต์ใน proxy.ts/lib/auth.ts, สร้างค่าด้วย: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
```

`deploy\windows\run-loop.ps1` อ่าน `SESSION_SECRET` จากไฟล์นี้ให้อัตโนมัติถ้าไม่ได้ใส่ `-SessionSecret` ตอนรัน — แต่ไม่ตั้งไว้เลย แอปจะปฏิเสธทุก request ตอนรันจริง (fail closed ไม่ใช่เปิดให้เข้าได้ฟรีๆ) บัญชีผู้ใช้แต่ละคนตั้งแยกต่างหาก (ดูหัวข้อ "การเพิ่มผู้ใช้" ท้ายเอกสารนี้)

### 5. รัน migration

```powershell
npx prisma migrate deploy
```

### 6. Build

```powershell
npm run build
```

(สคริปต์ `build` ตั้ง `--webpack` ไว้แล้วเป็นค่าเริ่มต้น เผื่อเครื่องนี้ก็ติด Application Control policy บล็อก native binary ของ SWC เหมือนเครื่อง dev)

Prisma Client (`lib/generated/prisma/`) ถูก `.gitignore` ตัดออก (regeneratable) — ต้อง `npx prisma generate` ให้เกิดโฟลเดอร์นี้ก่อน build ไม่งั้น build พังทันทีด้วย `Module not found: Can't resolve '@/lib/generated/prisma/client'` ตอนนี้ `package.json` มี `postinstall: prisma generate` แล้ว `npm ci` ในขั้นตอนที่ 3 จะ generate ให้อัตโนมัติ — ถ้าข้ามขั้น 3 หรือ generate พลาด รันเองด้วย `npx prisma generate` ก่อน `npm run build`

### 7. ประกอบไฟล์ standalone ให้พร้อมรัน

```powershell
.\deploy\windows\stage-standalone.ps1
```

คัดลอก `.next/static` และ `public/` เข้าไปใน `.next/standalone/` (จำเป็นเพราะ `next build` ไม่คัดลอกให้เองสองโฟลเดอร์นี้)

จากจุดนี้เลือกวิธี A หรือ B ต่อ

---

## วิธี A: ไม่มีสิทธิ์ Administrator

### 8A. รันด้วย run-loop.ps1

รันแบบ foreground ก่อนเพื่อทดสอบ (Ctrl+C เพื่อหยุด):

```powershell
.\deploy\windows\run-loop.ps1 -DatabaseUrl "postgresql://expense_billing:รหัสผ่านจริง@localhost:5432/expense_billing" -SessionSecret "ค่าจริงจากขั้นตอนที่ 4"
```

หรือถ้าตั้ง `DATABASE_URL`/`SESSION_SECRET` ไว้ใน `.env` แล้ว (ขั้นตอนที่ 4) ไม่ต้องใส่พารามิเตอร์พวกนี้ก็ได้ สคริปต์จะอ่านจากไฟล์นั้นให้เอง

ตรวจว่าเปิดได้จริงที่ `http://localhost:3000` แล้วค่อยกด Ctrl+C ปิด

### 9A. ตั้งให้ auto-start ตอน login

```powershell
.\deploy\windows\install-startup-shortcut.ps1 -DatabaseUrl "postgresql://expense_billing:รหัสผ่านจริง@localhost:5432/expense_billing" -SessionSecret "ค่าจริงจากขั้นตอนที่ 4"
```

สร้าง shortcut ในโฟลเดอร์ Startup ของ user ปัจจุบัน (`shell:startup`) ที่จะรัน `run-loop.ps1` แบบซ่อนหน้าต่างทุกครั้งที่ user นี้ login

**⚠️ ข้อจำกัด**: แอปจะเริ่มทำงาน **ก็ต่อเมื่อ user account นี้ login เข้า Windows แล้วเท่านั้น** ถ้าเซิร์ฟเวอร์ reboot แล้วไม่มีใคร login เลย แอปจะไม่ขึ้นจนกว่าจะมีคน login เข้าบัญชีนี้ (เช่น เปิด RDP เข้าไป login ครั้งหนึ่งแล้วปล่อย session ค้างไว้แบบ disconnect ก็นับว่า login อยู่) ถ้าต้องการให้ทำงานได้ตั้งแต่ก่อน login (เหมือน Service จริง) ต้องใช้วิธี B ซึ่งต้องมีสิทธิ์ admin

### 10A. เริ่มทำงานทันทีโดยไม่ต้อง login ใหม่

```powershell
.\deploy\windows\run-loop.ps1 -DatabaseUrl "postgresql://expense_billing:รหัสผ่านจริง@localhost:5432/expense_billing" -SessionSecret "ค่าจริงจากขั้นตอนที่ 4"
```

รันค้างไว้ใน background (เช่นเปิด PowerShell window แยกทิ้งไว้ หรือใช้ `Start-Process powershell -ArgumentList ...` เพื่อไม่ให้ค้าง terminal ปัจจุบัน)

### หยุด / ถอนการติดตั้ง (วิธี A)

```powershell
.\deploy\windows\stop-run-loop.ps1                # หยุด process ที่กำลังรันอยู่ตอนนี้
.\deploy\windows\uninstall-startup-shortcut.ps1    # เอา shortcut ออกจาก Startup folder (ไม่ auto-start อีกต่อไป)
```

### อัปเดตเวอร์ชันใหม่ (วิธี A)

**ต้องหยุด `run-loop.ps1` ก่อนเสมอ** ก่อนรัน `npm run build` — ไฟล์ที่ process เดิมเปิดค้างไว้ (`.next\standalone\server.js`) จะทำให้ build ลบโฟลเดอร์เพื่อสร้างใหม่ไม่ได้ (`EBUSY: resource busy or locked`) `stop-run-loop.ps1` ด้านล่างจัดการเรื่องนี้ให้แล้ว แค่อย่าข้ามขั้นตอนนี้ไป:

```powershell
cd C:\Apps\expense-billing-app-deploy-git   # หรือ path ที่ clone ไว้จริง
.\deploy\windows\stop-run-loop.ps1

git pull
npm ci                       # เฉพาะตอน package.json เปลี่ยน
npx prisma migrate deploy    # เฉพาะตอนมี migration ใหม่
npm run build
.\deploy\windows\stage-standalone.ps1

$dbUrl = (Get-Content .env | Select-String "^DATABASE_URL=").ToString().Split("=",2)[1].Trim('"')
$sessionSecret = (Get-Content .env | Select-String "^SESSION_SECRET=").ToString().Split("=",2)[1].Trim('"')
.\deploy\windows\run-loop.ps1 -DatabaseUrl $dbUrl -SessionSecret $sessionSecret
```

(อ่านค่า `DATABASE_URL`/`SESSION_SECRET` จาก `.env` ตรงๆ แทนการพิมพ์รหัสผ่านจริงลงคำสั่ง — ไม่มีความลับโผล่บนหน้าจอ/ประวัติคำสั่ง)

---

## วิธี B: มีสิทธิ์ Administrator

### สิ่งที่ต้องมีเพิ่ม

- [NSSM](https://nssm.cc/download) — แตกไฟล์แล้ว copy `nssm.exe` (เลือกตัวที่ตรงสถาปัตยกรรมเครื่อง เช่น `win64`) ไปไว้ในโฟลเดอร์ที่อยู่ใน `PATH` เช่น `C:\Windows\System32` หรือใช้พารามิเตอร์ `-NssmPath` ชี้ path เต็มแทนก็ได้ (หรือถ้ามี Chocolatey: `choco install nssm -y`)

### 8B. ติดตั้งเป็น Windows Service

```powershell
.\deploy\windows\install-service.ps1 -DatabaseUrl "postgresql://expense_billing:รหัสผ่านจริง@localhost:5432/expense_billing" -SessionSecret "ค่าจริงจากขั้นตอนที่ 4"
```

สคริปต์จะ:
- สร้าง service ชื่อ `ExpenseBillingApp` ให้รัน `node server.js` จาก `.next\standalone`
- ตั้งค่า auto-start ตอนบูตเครื่อง (ทำงานได้แม้ไม่มีใคร login)
- เขียน log ไปที่ `logs\service-out.log` / `logs\service-err.log`
- สตาร์ท service ให้ทันที

### 9B. ตรวจสอบ

```powershell
Get-Service ExpenseBillingApp
nssm status ExpenseBillingApp
```

### อัปเดตเวอร์ชันใหม่ (วิธี B)

**ต้อง `nssm stop ExpenseBillingApp` ก่อน `npm run build` เสมอ** — service เดิมเปิด `.next\standalone\server.js` ค้างไว้ ถ้าไม่หยุดก่อน `next build` จะลบโฟลเดอร์นั้นเพื่อสร้างใหม่ไม่ได้ (`EBUSY: resource busy or locked, rmdir '...\.next\standalone'`) `install-service.ps1` ท้ายสุดจะ stop/remove/ติดตั้งใหม่ให้เองก็จริง แต่นั่นเกิด**หลัง** build แล้ว สายเกินไป ต้องหยุดเองก่อนตั้งแต่ต้น:

```powershell
cd C:\Apps\expense-billing-app-deploy-git   # หรือ path ที่ clone ไว้จริง
nssm stop ExpenseBillingApp

git pull
npm ci                       # เฉพาะตอน package.json เปลี่ยน
npx prisma migrate deploy    # เฉพาะตอนมี migration ใหม่
npm run build
.\deploy\windows\stage-standalone.ps1

$dbUrl = (Get-Content .env | Select-String "^DATABASE_URL=").ToString().Split("=",2)[1].Trim('"')
$sessionSecret = (Get-Content .env | Select-String "^SESSION_SECRET=").ToString().Split("=",2)[1].Trim('"')
.\deploy\windows\install-service.ps1 -DatabaseUrl $dbUrl -SessionSecret $sessionSecret
```

(อ่านค่า `DATABASE_URL`/`SESSION_SECRET` จาก `.env` ตรงๆ แทนการพิมพ์รหัสผ่านจริงลงคำสั่ง — ไม่มีความลับโผล่บนหน้าจอ/ประวัติคำสั่ง) `install-service.ps1` รันซ้ำได้อย่างปลอดภัย — จะ stop/remove service เดิม (ถ้ายังไม่ได้หยุด) แล้วติดตั้งใหม่ทับ + สตาร์ทให้เองท้ายสุด

**Rollback ด่วน:** สลับกลับไปโฟลเดอร์เวอร์ชันก่อนหน้า (เช่น `C:\Apps\expense-billing-app-deploy` ถ้ายังเก็บไว้) แล้วรัน `install-service.ps1` ชุดเดียวกันจากในนั้นแทน — service จะชี้กลับไปที่โค้ดเก่าทันที ไม่ต้อง build ใหม่

### หยุด / ถอนการติดตั้ง (วิธี B)

```powershell
nssm stop ExpenseBillingApp             # หยุดชั่วคราว
.\deploy\windows\uninstall-service.ps1   # หยุดและลบ service ออกทั้งหมด
```

---

## เปิดพอร์ต (ถ้าจำเป็น)

ถ้า Windows Firewall เปิดอยู่และต้องให้เครื่องอื่นในองค์กรเข้าถึงได้ (ต้อง admin):

```powershell
New-NetFirewallRule -DisplayName "Expense Billing App" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

เปิด `http://<ip-เครื่องนี้>:3000` จากเครื่องอื่นในวง intranet

## การยืนยันตัวตน (login รายคน)

ทุกคนมีบัญชีของตัวเอง (username/password แยกคน) — ยังไม่มีระดับสิทธิ์ต่างกัน แต่ระบบบันทึกไว้ว่าบิลแต่ละใบสร้าง/แก้ไขล่าสุดโดยใคร เข้าเว็บครั้งแรกจะเด้งไปหน้า `/login` — ตั้งค่าคีย์เซ็น session cookie ที่ `SESSION_SECRET` ในไฟล์ `.env` (ขั้นตอนที่ 4) หรือใส่ผ่าน `-SessionSecret` ตอนรันสคริปต์ก็ได้ ไม่ตั้งไว้เลยสักทาง แอปจะปฏิเสธทุก request (fail closed)

`proxy.ts` ยังจำกัดจำนวน request ต่อ IP ด้วย (กัน brute-force รหัสผ่าน/สคริปต์ยิงรัวๆ) เกินแล้วตอบ `429` ชั่วคราว

## การเพิ่มผู้ใช้

ไม่มีหน้าสมัครสมาชิกเอง — เพิ่ม/แก้/ลบบัญชีผ่าน Prisma Studio โดยตรง (รันจากเซิร์ฟเวอร์ หรือเครื่องไหนก็ได้ที่ตั้ง `DATABASE_URL` ชี้มาที่ฐานข้อมูล production นี้ได้):

```powershell
# 1. สร้างค่า passwordHash จากรหัสผ่านที่ต้องการ
node -e "const c=require('crypto');const s=c.randomBytes(16);const h=c.pbkdf2Sync(process.argv[1],s,100000,32,'sha256');console.log('100000$'+s.toString('base64')+'$'+h.toString('base64'))" "รหัสผ่านที่ต้องการ"

# 2. เปิด Prisma Studio
npx prisma studio
```

เปิดตาราง `User` → เพิ่มแถวใหม่ → กรอก `username`, `displayName` (ชื่อที่จะโชว์เป็น "สร้างโดย/แก้ไขล่าสุดโดย"), วางค่า `passwordHash` จากขั้นตอนที่ 1 → บันทึก แล้วบอก username + รหัสผ่าน (ไม่ใช่ hash) ให้เจ้าของบัญชีไปกรอกที่หน้า `/login`

**ห้ามแตะช่อง `id`** ปล่อยว่างไว้ให้ Prisma Studio สร้างให้อัตโนมัติ — ถ้าเผลอลบ/เคลียร์จน `id` กลายเป็นค่าว่าง บัญชีนั้นจะ login ได้ปกติ (ไม่ error) แต่ระบบจะปฏิเสธ session เงียบๆ ทุกครั้ง ทำให้ "สร้างโดย/แก้ไขล่าสุดโดย" ไม่ขึ้นชื่อสักที ทั้งที่ login สำเร็จ

ลืมรหัสผ่าน/ต้องการปิดสิทธิ์ใครคนหนึ่ง → ทำซ้ำขั้นตอนที่ 1 แล้วแก้ `passwordHash` ของแถวนั้น หรือลบแถวทิ้งเลย ไม่กระทบบัญชีคนอื่น

## สำรองข้อมูล (backup)

`deploy\windows\backup-postgres.ps1` ทำให้อัตโนมัติได้ — dump ลงโฟลเดอร์ `backups\` ที่ root โปรเจกต์ ลบไฟล์เก่าเกิน retention ให้เอง:

```powershell
.\deploy\windows\backup-postgres.ps1 -DatabaseUrl "postgresql://expense_billing:รหัสผ่านจริง@localhost:5432/expense_billing"
```

ตั้งให้รันเป็นประจำผ่าน Windows Task Scheduler — ดูตัวอย่างคำสั่งลงทะเบียน (`Register-ScheduledTask`) ใน comment ต้นไฟล์ `backup-postgres.ps1`

หรือสำรองด้วยมือทันทีแบบเดิมก็ได้:

```powershell
$env:PGPASSWORD = "รหัสผ่านจริง"
pg_dump -U expense_billing -h localhost expense_billing > backup-$(Get-Date -Format yyyyMMdd).sql
```

กู้คืน (ไฟล์จากทั้งสองวิธีกู้คืนแบบเดียวกัน):

```powershell
$env:PGPASSWORD = "รหัสผ่านจริง"
psql -U expense_billing -h localhost expense_billing -f backup-YYYYMMDD.sql
```

(`pg_dump`/`psql` มาพร้อมตัวติดตั้ง PostgreSQL อยู่ที่ `C:\Program Files\PostgreSQL\<version>\bin\` — เพิ่มเข้า PATH หรือเรียก full path ก็ได้)

## ตั้งเซิร์ฟเวอร์ใหม่ด้วย Git (ทำครั้งเดียวตอน setup เซิร์ฟเวอร์ใหม่)

ทำหัวข้อนี้ครั้งเดียวตอนตั้งเซิร์ฟเวอร์ใหม่ (หรือเปลี่ยนจากวิธี zip เดิมมาเป็น git) แล้วใช้โฟลเดอร์ที่ได้แทน `C:\apps\expense-billing-app` ในทุกหัวข้อของเอกสารนี้ที่เหลือ

### ก. สร้าง deploy key (ทำที่เครื่องไหนก็ได้ที่มี `ssh-keygen`)

```powershell
ssh-keygen -t ed25519 -C "deploy@<ชื่อเซิร์ฟเวอร์>" -f expense-billing-app-deploy-key -N ""
```

ได้ไฟล์ 2 ไฟล์: `expense-billing-app-deploy-key` (private — **เก็บเป็นความลับ ห้าม commit เข้า repo**) และ `expense-billing-app-deploy-key.pub` (public — เอาไปวางบน GitHub ได้)

### ข. เพิ่ม public key บน GitHub

Repo settings → **Deploy keys** → **Add deploy key** → วางเนื้อหาไฟล์ `.pub` → ตั้งชื่อให้จำได้ (เช่น ชื่อเซิร์ฟเวอร์) → **อย่าติ๊ก "Allow write access"** (deploy key ควรเป็น read-only เสมอ — เซิร์ฟเวอร์แค่ดึงโค้ด ไม่เคย push) แยกกุญแจคนละดอกต่อเซิร์ฟเวอร์ ไม่ใช้ซ้ำกัน เผื่อต้องถอนสิทธิ์เครื่องใดเครื่องหนึ่งภายหลังโดยไม่กระทบเครื่องอื่น

### ค. ติดตั้ง Git บนเซิร์ฟเวอร์

```powershell
winget install --id Git.Git -e --source winget
```

ถ้าเซิร์ฟเวอร์ไม่มี `winget` (พบบ่อยใน Windows Server รุ่นเก่า) ดาวน์โหลดตัวติดตั้งเองจาก `https://git-scm.com/download/win` แล้วรัน กด Next ด้วยค่า default ได้ทั้งหมด — สำคัญแค่ตอนเลือก "Adjusting your PATH environment" ต้องเป็น **"Git from the command line and also from 3rd-party software"** (ไม่ใช่ตัวที่มี "Unix tools" ต่อท้าย จะไปทับคำสั่ง Windows เดิม) ปิด PowerShell แล้วเปิดใหม่หลังติดตั้งเสร็จ (`git --version` เช็คว่าใช้ได้)

### ง. ตั้งค่า SSH ให้ใช้ deploy key

Copy ไฟล์ private key (**ไม่ใช่ไฟล์ `.pub`**) เข้าเซิร์ฟเวอร์ เช่นไปไว้ที่ `C:\Users\Administrator\.ssh\expense-billing-app-deploy-key` แล้วสร้างไฟล์ config:

```powershell
@"
Host github.com
  HostName github.com
  User git
  IdentityFile C:\Users\Administrator\.ssh\expense-billing-app-deploy-key
  IdentitiesOnly yes
"@ | Set-Content -Encoding ascii -Path "$env:USERPROFILE\.ssh\config"
```

**ต้องใช้ `-Encoding ascii`** — `Out-File -Encoding utf8` บน Windows PowerShell 5.1 (ค่า default ของเครื่อง Windows Server ส่วนใหญ่) จะแปะ BOM ไว้หน้าไฟล์ ทำให้ SSH อ่านคำว่า `Host` ผิดเพี้ยนเป็น error `Bad configuration option`

ทดสอบว่าเชื่อมต่อได้:

```powershell
ssh -T git@github.com
```

เจอ prompt ถาม fingerprint ครั้งแรกให้พิมพ์ `yes` ผลลัพธ์ที่ถูกต้องคือ `Hi <org>/<repo>! You've successfully authenticated, but GitHub does not provide shell access.`

### จ. Clone repo

```powershell
cd C:\Apps
git clone git@github.com:Phusit-w/ICN-Main-App-Project.git expense-billing-app-deploy-git
cd expense-billing-app-deploy-git
git log --oneline -1   # เช็คว่าได้ commit ล่าสุดจริง
```

จากนี้ไปทำตามเอกสารต่อตั้งแต่หัวข้อ **"3. ติดตั้ง dependencies"** ได้เลย โดยใช้โฟลเดอร์นี้แทน `C:\apps\expense-billing-app` ทุกที่

**ถ้ากำลังย้ายจากวิธี zip เดิม (มีเซิร์ฟเวอร์รันอยู่แล้ว):** clone ไปโฟลเดอร์ **ใหม่** แยกจากโฟลเดอร์ zip เดิม (อย่า clone ทับ) — คัดลอก `.env`/`backups`/`logs` จากโฟลเดอร์เดิมมาที่โฟลเดอร์ใหม่ก่อน แล้วค่อยรัน `install-service.ps1`/`run-loop.ps1` จากโฟลเดอร์ใหม่เพื่อสลับ service มาชี้ที่นี่ — โฟลเดอร์ zip เดิมเก็บไว้เป็น instant-rollback ได้ (แค่รัน `install-service.ps1`/`run-loop.ps1` จากในนั้นซ้ำถ้าต้องย้อนกลับ) ไม่ต้องลบทิ้งจนกว่าจะมั่นใจว่าวิธีใหม่เสถียรดีแล้ว

## หมายเหตุ

- มี login รายคนแล้ว (ดูหัวข้อ "การยืนยันตัวตน"/"การเพิ่มผู้ใช้" ด้านบน) แต่ยังไม่มีระดับสิทธิ์ต่างกัน — บัญชีไหนที่ล็อกอินได้ก็กรอก/แก้ไข/ลบข้อมูลได้ทั้งหมดเหมือนกันหมด (แยกได้แค่ "ใครทำ" ผ่าน `createdByName`/`updatedByName` ไม่ใช่ "ใครทำอะไรได้บ้าง") ควรจำกัดการเข้าถึงระดับเครือข่ายเพิ่มด้วย (intranet only, firewall) เป็นชั้นป้องกันที่สอง
- การเซ็นอนุมัติยังคงเป็นการเซ็นบนกระดาษหลังพิมพ์ออกมา
- **ยังไม่มี HTTPS ให้อัตโนมัติในวิธี native นี้** (ต่างจาก `DEPLOY.md`/Docker ที่มี Caddy ทำให้) — session cookie ที่เพิ่งตั้งไว้ส่งผ่านเครือข่ายแบบไม่เข้ารหัสถ้าไม่มี HTTPS คั่นกลาง ใครดักแพ็กเก็ตในเครือข่ายได้ก็เห็น cookie แล้วสวมสิทธิ์ล็อกอินแทนได้ — ต้องตั้ง reverse proxy เอง (IIS + URL Rewrite/ARR + certificate, หรือ nginx for Windows) ชี้มาที่พอร์ต 3000 — ไม่รวมอยู่ในสคริปต์นี้เพราะแล้วแต่ setup ขององค์กร
- **IIS รับ request ได้แค่ราว 28.6 MB โดย default** (`maxAllowedContentLength` = 30,000,000 bytes) ถ้าไม่ตั้งค่านี้ การอัปโหลดงานตรวจ SOC
  ที่ไฟล์รวมใหญ่กว่านั้นจะได้หน้า error HTML ของ IIS แทน JSON และหน้าเว็บขึ้นว่า `Unexpected token 'T', "The page w"... is not valid JSON`
  (เจอบน prod 2026-10-08) ให้เพิ่มส่วนนี้ใน `<system.webServer>` ของ `C:\inetpub\wwwroot\web.config` (300 MB เท่ากับ
  `proxyClientMaxBodySize` ใน `next.config.ts` และครอบ DOCX 25 MB + PDF รวม 250 MB) IIS ใช้ค่าใหม่ทันที ไม่ต้อง restart:
  ```xml
  <security>
      <requestFiltering>
          <requestLimits maxAllowedContentLength="314572800" />
      </requestFiltering>
  </security>
  ```
- ทั้งวิธี A และ B ทดสอบแล้วจริงว่า build → stage → รันเซิร์ฟเวอร์ → auto-restart เมื่อ process ถูกฆ่า ทำงานถูกต้อง รวมถึงการย้ายสคริปต์ทั้งหมดเข้า `deploy\windows\` ก็ทดสอบ path resolution จริงแล้ว (`stage-standalone.ps1`, `install-service.ps1` ผ่านจนถึงจุดที่ควรจะผ่าน — ล้มเหลวที่ nssm.exe หายไปตามที่คาดไว้, `stop-run-loop.ps1` เจอ/ลบ pid file ที่ตำแหน่งถูกต้อง) ส่วนการติดตั้ง shortcut ใน Startup folder จริง (วิธี A ขั้นตอน 9A) และการสร้าง Windows Service จริงผ่าน NSSM (วิธี B) ยังไม่ได้ทดสอบบนเครื่อง/เซิร์ฟเวอร์เป้าหมายจริง เพราะสภาพแวดล้อมที่พัฒนาไม่มีสิทธิ์ admin และไม่ควรทิ้ง auto-start ถาวรไว้บนเครื่อง dev
