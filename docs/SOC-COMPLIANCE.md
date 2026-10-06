# ระบบตรวจสอบ SOC

ระบบรับ SOC `.docx` หนึ่งไฟล์และ Datasheet/Catalog `.pdf` 1–10 ไฟล์ แล้วสร้างงานใน PostgreSQL ให้ worker ประมวลผลเบื้องหลัง ผู้สร้างงานตรวจทานผลบน `/soc/[id]` ก่อนยืนยันและดาวน์โหลดสำเนา DOCX ที่มีรายงานแนบท้าย

## ขอบเขตและกติกา

- ตรวจเลขหน้า ชื่อหัวข้อ ยี่ห้อ/รุ่น และความเกี่ยวข้องของเนื้อหา
- ไม่แก้ตาราง SOC ต้นฉบับ และไม่ตัดสิน Comply/Better/Non-compliant
- หน้าที่อ่าน text ไม่ได้ใช้ `unverifiable`; ระบบไม่สรุปเป็น `mismatch` อัตโนมัติ
- แถวหัวข้อหมวดที่ไม่มี claim ใช้ `not_applicable`
- AI ภายนอกปิดเป็นค่าเริ่มต้น (`SOC_AI_PROVIDER=disabled`) และ provider boundary อยู่ใน `soc-worker/ai_provider.py`
- ไฟล์เป็น private storage ดาวน์โหลดได้เฉพาะเจ้าของงานหรือบัญชี `ADMIN` และถูกลบหลัง 90 วัน

## รันบนเครื่องพัฒนา

ต้องมี PostgreSQL/migration และ Python 3.12:

```powershell
python -m pip install -r soc-worker\requirements.txt
npx prisma migrate deploy
$env:SOC_STORAGE_ROOT = "$PWD\data\soc"
npm run soc:worker
```

เปิดอีก terminal แล้วรัน `npm run dev` เข้าระบบที่ `/login` และเปิด `/soc` แม้ development proxy จะไม่บังคับ login แต่ฟีเจอร์ SOC ต้องมี session เพื่อกำหนดเจ้าของไฟล์

ทดสอบ worker ด้วย `npm run soc:test` ส่วนเทสต์ TypeScript ของเว็บรันด้วย `npm test` ดูวิธีตั้งค่าฐานข้อมูลเทสต์ใน [SOC-TESTING.md](SOC-TESTING.md)

## Deploy ด้วย Docker

`docker-compose.yml` มี `soc-worker` และ named volume `soc_data` ที่แชร์กับแอปแล้ว:

```powershell
docker compose up -d --build
```

worker ใช้ PostgreSQL เป็น durable queue จึงไม่ต้องติดตั้ง Redis และ LibreOffice ใน worker image ใช้สร้าง PDF preview แบบ best-effort หาก preview ล้มเหลว DOCX ยังถูกสร้างตามปกติ

## Deploy แบบ Windows native

ติดตั้ง Python 3.12, LibreOffice และ requirements จากนั้นรัน `npm run soc:worker` เป็น process แยกจาก Next.js โดยกำหนด `DATABASE_URL` และ `SOC_STORAGE_ROOT` ให้ตรงกับแอป แนะนำติดตั้ง worker เป็น NSSM service แยกและตั้ง auto-restart

## สิทธิ์ Admin

- `USER` เห็นและแก้ไขเฉพาะเอกสารค่าใช้จ่าย/งาน SOC ของตนเอง และย้ายงานของตนเข้าถังขยะได้
- `ADMIN` เห็นข้อมูลทุกคน และเข้า `/admin` เพื่อดูภาพรวม จัดการผู้ใช้ Audit Log ถังขยะ และสถานะ worker
- Admin สร้างบัญชีหรือรีเซ็ตรหัสผ่านได้ ระบบแสดงรหัสผ่านชั่วคราวครั้งเดียวและบังคับเปลี่ยนเมื่อเข้าสู่ระบบ
- การปิดบัญชีและเปลี่ยน role ตัด session เดิมทันที ระบบห้าม Admin ปิดหรือลดสิทธิ์ตนเอง และต้องมี Admin ที่ใช้งานได้อย่างน้อยหนึ่งคน
- ไม่ลบบัญชีผู้ใช้ถาวร เพื่อรักษาประวัติ Audit; ใช้การปิดบัญชีแทน
- รายการในถังขยะเก็บ 30 วัน ส่วน Audit Log เก็บ 2 ปี และดาวน์โหลด CSV ได้จาก `/admin/activity`

## สถานะงาน

`DRAFT → QUEUED → PROCESSING → NEEDS_REVIEW → CONFIRMED → EXPORTING → COMPLETED`

งานผิดพลาดเป็น `FAILED` และลองใหม่ได้ งานที่เกินอายุเป็น `EXPIRED`; worker ลบไฟล์และ redaction เนื้อหาที่ดึงจากเอกสาร แต่คง metadata/audit event ไว้
