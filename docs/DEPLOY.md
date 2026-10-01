# การ Deploy บนเซิร์ฟเวอร์ภายในองค์กร (on-prem / intranet)

แอปนี้แพ็กเป็น 2 container ผ่าน `docker compose`: `app` (Next.js) และ `db` (PostgreSQL) ไม่ต้องพึ่งบริการภายนอกใดๆ เหมาะกับการรันบนเซิร์ฟเวอร์ภายในองค์กรที่ไม่ต่อเน็ตออกไปข้างนอกก็ได้ (ยกเว้นตอน build image ครั้งแรกที่ต้อง `npm ci` และดึง base image จาก Docker Hub)

## สิ่งที่ต้องมีบนเซิร์ฟเวอร์

- Docker Engine + Docker Compose plugin (`docker compose version` ใช้ได้)
- พอร์ต 3000 ว่าง (หรือแก้ mapping ใน `docker-compose.yml` ตามต้องการ)

## ขั้นตอน

1. คัดลอกโฟลเดอร์โปรเจกต์ทั้งหมด (`Main_Project_Build_App/`) ไปที่เซิร์ฟเวอร์

2. สร้างไฟล์ `.env` ข้างๆ `docker-compose.yml` (คัดลอกจาก `.env.example`) แล้วตั้งค่าจริงทั้งหมด:

   ```bash
   cp .env.example .env
   # แก้ POSTGRES_PASSWORD, SESSION_SECRET ในไฟล์ .env ให้เป็นค่าจริงที่ปลอดภัย
   # (สร้าง SESSION_SECRET ด้วย: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
   ```

   ไฟล์ `.env` นี้ใช้โดย `docker compose` เท่านั้น (เพื่อกำหนด `POSTGRES_PASSWORD`/`SESSION_SECRET`) — คนละไฟล์กับ `.env` ที่เคยใช้ตอน dev ในเครื่อง ไม่ต้องคัดลอกอันเก่ามาด้วย `SESSION_SECRET` เป็นค่าที่ใช้เซ็น session cookie ของระบบ login รายคน (ดูคอมเมนต์ใน `proxy.ts`/`lib/auth.ts`) — ไม่ตั้งไว้ ระบบจะปฏิเสธทุก request ตอน production (fail closed) ไม่ใช่เปิดให้เข้าได้ฟรีๆ บัญชีผู้ใช้แต่ละคนตั้งแยกต่างหาก (ดูหัวข้อ "การเพิ่มผู้ใช้" ด้านล่าง)

3. สั่งสร้างและรัน:

   ```bash
   docker compose up -d --build
   ```

   ครั้งแรกจะใช้เวลาสักพัก (build image + ดึง postgres/caddy image) รอบต่อๆ ไปที่ deploy โค้ดใหม่จะเร็วกว่านี้เพราะมี layer cache

4. Container `app` จะรัน **database migration ให้อัตโนมัติ** ทุกครั้งที่ container เริ่ม (ดู `docker-entrypoint.sh`) — ไม่ต้องรันคำสั่ง migrate เองแยกต่างหาก ถ้า schema ไม่มีอะไรเปลี่ยนคำสั่งนี้จะไม่ทำอะไร (no-op)

5. เข้าใช้งานผ่าน `https://<server-ip>` (พอร์ต 443 ผ่าน `caddy`, ไม่ใช่ 3000 ตรงๆ อีกต่อไป — ดูหัวข้อ HTTPS ด้านล่าง) เบราว์เซอร์จะเตือน "ไม่ปลอดภัย/not trusted" ในครั้งแรกเพราะใช้ certificate ที่ Caddy สร้างเอง (self-signed) ถือเป็นเรื่องปกติสำหรับแอปภายในองค์กรที่ไม่มีโดเมนสาธารณะ — กด "ดำเนินการต่อ"/Advanced → Proceed ได้ หรือจะติดตั้ง Caddy's local root CA บนเครื่องพนักงานเพื่อไม่ให้ขึ้นเตือนอีกก็ได้ (ดูหัวข้อ HTTPS)

## การยืนยันตัวตน (login รายคน)

ทุกคนมีบัญชีของตัวเอง (username/password แยกคน, ดูหัวข้อ "การเพิ่มผู้ใช้" ถัดไป) — ยังไม่มีระดับสิทธิ์ต่างกัน (role) บัญชีไหนก็ทำได้ทุกอย่างเหมือนกันหมด แต่ระบบจะบันทึกไว้ว่าบิลแต่ละใบสร้าง/แก้ไขล่าสุดโดยใคร (`ExpenseRecord.createdByName`/`updatedByName`) เข้าเว็บครั้งแรกจะเด้งไปหน้า `/login` ให้กรอก username/password (จำได้ ~30 วันผ่าน session cookie จนกว่าจะกด "ออกจากระบบ") ตั้งค่าคีย์เซ็น cookie ได้ที่ `SESSION_SECRET` ในไฟล์ `.env`

`proxy.ts` ไฟล์เดียวกันนี้ยังจำกัดจำนวน request ต่อ IP ด้วย (rate limiting) — ถ้า IP ไหนยิง request รัวเกินไปในช่วงเวลาสั้นๆ (ป้องกันการเดารหัสผ่านแบบ brute-force หรือสคริปต์ยิงลบ/บันทึกรัวๆ) จะได้ error 429 กลับไปชั่วคราว

ถ้าไม่ตั้ง `SESSION_SECRET` ตอน production ระบบจะตอบ error 500 ปฏิเสธทุก request แทนที่จะเปิดให้เข้าได้แบบไม่มีรหัสผ่านเงียบๆ

## การเพิ่มผู้ใช้

ไม่มีหน้าสมัครสมาชิกเอง (ทีมเล็ก ไม่คุ้มทำ) — เพิ่ม/แก้/ลบบัญชีผ่าน Prisma Studio โดยตรง:

1. สร้างค่า `passwordHash` จากรหัสผ่านที่ต้องการ (รันบนเครื่องไหนก็ได้ที่มี Node.js — ไม่ต้องเชื่อมฐานข้อมูล):

   ```bash
   node -e "const c=require('crypto');const s=c.randomBytes(16);const h=c.pbkdf2Sync(process.argv[1],s,100000,32,'sha256');console.log('100000$'+s.toString('base64')+'$'+h.toString('base64'))" "รหัสผ่านที่ต้องการ"
   ```

2. เปิด Prisma Studio ชี้ไปที่ฐานข้อมูล production (ต้องมี `DATABASE_URL` จริงใน `.env` ที่เครื่องที่รันคำสั่งนี้):

   ```bash
   npx prisma studio
   ```

3. เปิดตาราง `User` → เพิ่มแถวใหม่ → กรอก `username`, `displayName` (ชื่อที่จะโชว์เป็น "สร้างโดย/แก้ไขล่าสุดโดย"), และวางค่า `passwordHash` จากขั้นตอนที่ 1 → บันทึก

   **ห้ามแตะช่อง `id`** ปล่อยว่างไว้ให้ Prisma Studio สร้างให้อัตโนมัติ (ปุ่ม/ตัวเลือก "Generate" หรือค่า default) — ถ้าเผลอลบ/เคลียร์จน `id` กลายเป็นค่าว่าง บัญชีนั้นจะ login ได้ปกติ (ไม่ error) แต่ระบบจะปฏิเสธ session เงียบๆ ทุกครั้ง ทำให้ "สร้างโดย/แก้ไขล่าสุดโดย" ไม่ขึ้นชื่อสักที ทั้งที่ login สำเร็จ — ถ้าเจอแบบนี้ให้กลับมาเช็คว่า `id` ของบัญชีนั้นว่างอยู่หรือเปล่า

4. บอก username + รหัสผ่าน (ไม่ใช่ hash) ให้เจ้าของบัญชีไปกรอกที่หน้า `/login`

ลืมรหัสผ่าน/ต้องการเปลี่ยน → ทำซ้ำขั้นตอนที่ 1 ด้วยรหัสใหม่ แล้วแก้ `passwordHash` ของแถวนั้นใน Prisma Studio (ไม่มี flow ลืมรหัสผ่านผ่านอีเมล เพราะไม่มี email infra) ต้องการปิดสิทธิ์เข้าใช้ของใครคนหนึ่ง → ลบแถวของคนนั้นทิ้งได้เลย ไม่กระทบบัญชีคนอื่น

## HTTPS

`docker-compose.yml` มี service `caddy` ทำหน้าที่ทำ HTTPS ให้อัตโนมัติด้วย certificate ที่ Caddy สร้างเอง (self-signed, ผ่าน `tls internal` ใน `Caddyfile`) เหมาะกับการใช้งานแบบ intranet/VPN ภายในที่ไม่มีโดเมนสาธารณะ — จำเป็นเพราะไม่มี HTTPS คั่นกลาง ใครดักแพ็กเก็ตในเครือข่ายได้ก็เห็น session cookie ตรงๆ แล้วสวมสิทธิ์ล็อกอินแทนได้

ถ้าองค์กรมี internal CA หรือ certificate จริงอยู่แล้ว แก้ `Caddyfile` เปลี่ยนบรรทัด `tls internal` เป็น `tls /path/to/cert.pem /path/to/key.pem` (mount ไฟล์ cert เข้า container เพิ่ม) — ไม่ต้องแก้อย่างอื่นเลย

`app` container เองไม่ publish พอร์ต 3000 ออกสู่ host โดยตรงอีกต่อไป (ดูคอมเมนต์ใน `docker-compose.yml`) เข้าถึงได้ทาง `caddy` เท่านั้น

## ตรวจสถานะ / ดู log

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
```

## อัปเดตเวอร์ชันใหม่

```bash
git pull   # หรือคัดลอกไฟล์ที่แก้ไขแล้วมาทับ
docker compose up -d --build
```

Schema migration ใหม่ (ถ้ามี) จะถูก apply อัตโนมัติตอน container `app` เริ่มใหม่ (ขั้นตอนที่ 4 ด้านบน)

## สำรองข้อมูล (backup)

Service `backup` ใน `docker-compose.yml` สำรองข้อมูลให้อัตโนมัติทุก 24 ชั่วโมง (ดู `backup.sh`) ไฟล์ `.sql` แต่ละไฟล์เก็บไว้ที่โฟลเดอร์ `./backups/` ข้างๆ `docker-compose.yml` โดยตรง (ไม่ใช่ Docker volume) เพื่อให้คัดลอกไฟล์ออกไปเก็บที่อื่น (เช่น NAS, cloud storage) ได้ง่ายๆ ด้วยเครื่องมือ copy ธรรมดา ไม่ต้องพึ่ง Docker เลย — ไฟล์เก่าเกิน `BACKUP_RETENTION_DAYS` วัน (ค่าเริ่มต้น 30 วัน ตั้งใน `.env` ได้) จะถูกลบทิ้งอัตโนมัติ

ตรวจว่าสำรองสำเร็จหรือไม่:

```bash
docker compose logs -f backup
ls -la backups/
```

ถ้าต้องการสำรองทันที (ไม่ต้องรอรอบถัดไป) หรือย้ายเครื่อง สำรองด้วยมือแบบเดิมก็ยังใช้ได้:

```bash
docker compose exec db pg_dump -U expense_billing expense_billing > backup-$(date +%Y%m%d).sql
```

กู้คืน (ไฟล์จากทั้งสองวิธีข้างบนกู้คืนแบบเดียวกัน):

```bash
cat backups/backup-YYYYMMDD-HHMMSS.sql | docker compose exec -T db psql -U expense_billing expense_billing
```

**สำคัญ:** backup อัตโนมัตินี้อยู่บนเครื่องเดียวกับตัวแอป ถ้าเครื่อง/ดิสก์พังทั้งเครื่อง backup ก็หายไปด้วย ควรตั้งกระบวนการคัดลอกไฟล์ในโฟลเดอร์ `./backups/` ออกไปเก็บที่อื่นเป็นระยะ (เช่น sync ไป NAS หรือ cloud storage) แยกต่างหาก ไม่ได้รวมมาให้ในนี้เพราะแล้วแต่ infra ที่แต่ละองค์กรมี

## หยุดระบบ

```bash
docker compose down       # หยุด container แต่ข้อมูลใน volume ยังอยู่
docker compose down -v    # หยุดและลบ volume — ข้อมูลหายทั้งหมด ใช้เมื่อต้องการเท่านั้น
```

## หมายเหตุ

- ระบบนี้มี login รายคนแล้ว (ดูหัวข้อ "การยืนยันตัวตน"/"การเพิ่มผู้ใช้" ด้านบน) แต่ยังไม่มีระดับสิทธิ์ต่างกัน — บัญชีไหนที่ล็อกอินได้ก็กรอก/แก้ไข/ลบข้อมูลได้ทั้งหมดเหมือนกันหมด (แยกได้แค่ "ใครทำ" ผ่าน `createdByName`/`updatedByName` ไม่ใช่ "ใครทำอะไรได้บ้าง") ควรจำกัดการเข้าถึงระดับเครือข่ายเพิ่มด้วย (VPN/intranet only, firewall) เป็นชั้นป้องกันที่สอง ไม่ใช่พึ่งบัญชี login อย่างเดียว
- การเซ็นอนุมัติยังคงเป็นการเซ็นบนกระดาษหลังพิมพ์ออกมา (ไม่มี digital approval workflow ในระบบ)
- ถ้าองค์กรมี reverse proxy/HTTPS ของตัวเองอยู่แล้ว (เช่น nginx ที่หน้า data center) จะ proxy ตรงไปที่พอร์ต 443 ของ container `caddy` หรือจะถอด `caddy` service ออกแล้ว proxy ตรงไปที่ `app:3000` (ปรับกลับมา publish พอร์ต) แทนก็ได้ แล้วแต่ setup
- การ deploy แบบ native Windows (ดู [`DEPLOY-WINDOWS.md`](./DEPLOY-WINDOWS.md), สคริปต์อยู่ใน `deploy/windows/`) **ไม่มี HTTPS ให้อัตโนมัติเหมือน docker-compose** — ต้องตั้ง reverse proxy (เช่น IIS + certificate) หน้า `deploy\windows\install-service.ps1` เองแยกต่างหาก มิฉะนั้น session cookie จะส่งผ่านเครือข่ายแบบไม่เข้ารหัส
- การ deploy แบบเดียวกันนี้ก็ไม่มี backup อัตโนมัติแบบ docker-compose (service `backup`) ให้เหมือนกัน — ใช้ `deploy\windows\backup-postgres.ps1` แทน (ต้องมี `pg_dump.exe` บนเครื่อง มากับตัวติดตั้ง PostgreSQL) แล้วตั้งให้รันเป็นประจำผ่าน Windows Task Scheduler เอง — ดูตัวอย่างคำสั่งลงทะเบียนใน comment ของไฟล์นั้น
