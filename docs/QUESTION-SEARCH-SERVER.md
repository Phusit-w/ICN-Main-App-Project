# Question Search (ถามด้วยประโยค) บน server จริง

ถามด้วยประโยคบนหน้า ค้นหาโครงการ ใช้ model `qwen3:4b` ผ่าน [Ollama](https://ollama.com) ที่รัน**บน server เครื่องเดียวกับแอป** ฟังเฉพาะ `127.0.0.1` คำถามไม่ออกนอกเครื่อง
แอปไม่ได้จัดการ Ollama ให้ (`update.ps1` ไม่แตะ) ขั้นตอนข้างล่างทำครั้งเดียวด้วยมือ ด้วย PowerShell แบบ **Run as Administrator**

ตราบใดที่ service ของแอปยังไม่มี `QUESTION_SEARCH_OLLAMA_URL` โหมดนี้จะถูกซ่อน deploy โค้ดก่อนตั้ง Ollama ได้เลย

Spec และ ticket: `.scratch/question-search/` · วัดบน server 2026-10-28: p50 5.2 s, p90 9.7 s, ใช้ RAM ~3 GB

## 1. ติดตั้ง Ollama และเอา auto-start ตอน login ออก

1. ติดตั้งด้วย installer จาก ollama.com (ลงที่ `C:\Users\<user>\AppData\Local\Programs\Ollama\` — server เครื่องนี้ติดตั้งไว้แล้วตอน prototype 2026-10-28)
2. ปิดตัวที่ installer ตั้งให้รันเองตอน login — ไม่อย่างนั้นจะมี Ollama สองตัวแย่งพอร์ตกับ service ทำ**ก่อน**ติดตั้ง service เท่านั้น (คำสั่งแรกปิด Ollama ทุกตัว รวมถึง service ถ้ามีแล้ว):

   ```powershell
   Get-Process ollama* -ErrorAction SilentlyContinue | Stop-Process -Force
   Remove-Item "C:\Users\<user>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Ollama.lnk" -ErrorAction SilentlyContinue   # <user> = บัญชีที่ติดตั้ง Ollama
   ```

   ตัว tray ของ Ollama อัปเดตตัวเองแล้วอาจใส่ shortcut นี้กลับมา — หลังอัปเดต Ollama ให้ตรวจโฟลเดอร์ Startup นี้อีกครั้ง

## 2. ติดตั้งเป็น service ด้วย NSSM

model เก็บที่ `C:\ollama\models` (service รันเป็น LocalSystem ซึ่งไม่เห็นโฟลเดอร์ `.ollama` ของ user)

```powershell
$exe = "C:\Users\<user>\AppData\Local\Programs\Ollama\ollama.exe"   # แก้ <user>
New-Item -ItemType Directory -Force C:\ollama\models, C:\ollama\logs | Out-Null
nssm install Ollama $exe serve
nssm set Ollama AppEnvironmentExtra "OLLAMA_HOST=127.0.0.1:11434" "OLLAMA_MODELS=C:\ollama\models" "OLLAMA_NUM_PARALLEL=1" "OLLAMA_MAX_LOADED_MODELS=1" "OLLAMA_KEEP_ALIVE=-1"
nssm set Ollama AppStdout C:\ollama\logs\ollama.log
nssm set Ollama AppStderr C:\ollama\logs\ollama.log
nssm set Ollama Start SERVICE_AUTO_START
nssm start Ollama
```

- `OLLAMA_NUM_PARALLEL=1` ตอบทีละคำถาม, `OLLAMA_MAX_LOADED_MODELS=1` โหลด model เดียว, `OLLAMA_KEEP_ALIVE=-1` ค้าง model ไว้ในหน่วยความจำ (โหลดใหม่ทีละ 6–30 s) — แอปเองก็ส่ง `keep_alive: -1` และใช้ 6 ใน 8 core (`num_thread: 6`) ให้แอปอื่นยังลื่น
- ห้ามมีบรรทัดว่างใน `AppEnvironmentExtra` — NSSM จะหยุดอ่านตรงนั้น ตัวแปรที่อยู่ถัดไปจะหายเงียบ ๆ

## 3. ดึง model และตรวจว่าไม่ได้เปิดออก network

ทำในหน้าต่างเดียวกับขั้นที่ 2 (ใช้ `$exe`) ตรวจ `nssm status Ollama` ว่า `SERVICE_RUNNING` ก่อน `pull` สั่ง service ให้ดาวน์โหลดเอง (ลง `C:\ollama\models` ของ service) — service รันเป็น LocalSystem ต้องออก internet ได้ ถ้าบริษัทใช้ proxy ให้เพิ่ม `HTTPS_PROXY=...` ใน `AppEnvironmentExtra` ของ Ollama แล้ว `nssm restart Ollama`

```powershell
$env:OLLAMA_HOST = "127.0.0.1:11434"
& $exe pull qwen3:4b
Invoke-RestMethod http://127.0.0.1:11434/api/tags | Select-Object -ExpandProperty models | Select-Object name
Get-NetTCPConnection -LocalPort 11434 -State Listen | Select-Object LocalAddress   # ต้องเห็นแค่ 127.0.0.1
```

ถ้า `LocalAddress` เป็น `0.0.0.0` หรือ `::` แปลว่า `OLLAMA_HOST` ไม่ถึง service — ตรวจขั้นที่ 2 แล้ว `nssm restart Ollama`

## 4. วัดผลบน server ก่อนเปิดใช้

ในโฟลเดอร์แอป (หลัง deploy โค้ดที่มี `scripts/question-search-eval/`) — อ่านรายการหมวด/ลักษณะงาน/ชื่อหน่วยงานจากฐานข้อมูลจริงผ่าน `.env` (อ่านอย่างเดียว):

```powershell
node --env-file=.env --import ./scripts/question-search-eval/register.mjs scripts/question-search-eval/run.ts
node --env-file=.env --import ./scripts/question-search-eval/register.mjs scripts/question-search-eval/run.ts questions-holdout.json
```

ควรได้ใกล้ผล prototype: ≥ 90% exact, p90 ≤ 15 s ถ้าต่ำกว่านั้นมาก ดูข้อที่ FAIL ก่อน — ส่วนใหญ่แก้ได้ด้วยคำพ้อง/ชื่อหน่วยงานใน Admin Center ไม่ต้องแก้โค้ด

## 5. เปิดโหมดให้ admin ใช้

เพิ่มสองบรรทัดเข้า environment ของ service แอป (ExpenseBillingApp) แบบไม่ทับของเดิมและตัดบรรทัดว่างทิ้ง:

```powershell
$key = "HKLM:\SYSTEM\CurrentControlSet\Services\ExpenseBillingApp\Parameters"
# install-service.ps1 เขียนทั้งหมดเป็นค่าเดียวคั่นด้วยขึ้นบรรทัด — แยกก่อน (เหมือน update.ps1)
$lines = (@((Get-ItemProperty $key).AppEnvironmentExtra) -join "`n") -split "`n" | Where-Object { $_ -and $_.Trim() -and $_ -notmatch '^QUESTION_SEARCH_' }
$lines += "QUESTION_SEARCH_OLLAMA_URL=http://127.0.0.1:11434", "QUESTION_SEARCH_MODEL=qwen3:4b"
Set-ItemProperty $key -Name AppEnvironmentExtra -Type MultiString -Value $lines
nssm restart ExpenseBillingApp
```

จากนั้นเข้า ค้นหาโครงการ ด้วยบัญชี admin → ▸ ถามด้วยประโยค แล้วถามสัก 2–3 คำถาม คำถามแรกหลัง Ollama เพิ่ง start อาจช้า (โหลด model) ถ้าเกิน 30 s จะค้นแบบคำค้นแทนพร้อมหมายเหตุ — ถามซ้ำได้

ปิดโหมด: เอาสองบรรทัดนั้นออกด้วยคำสั่งเดียวกัน (ไม่ต้อง `+=`) แล้ว restart

`update.ps1` เก็บ environment นี้ไว้ทุกครั้ง แต่ถ้ารัน `install-service.ps1` ใหม่ (ติดตั้ง service แอปใหม่) environment จะถูกเขียนทับ — ต้องทำขั้นนี้ซ้ำ

## 6. จาก log จริงเป็นชุดทดสอบเปิดใช้ทุกคน

ทุกคำถามบันทึกเป็น AuditLog action `project-card.question-search`: คำถามอยู่ใน summary ส่วน metadata เก็บตัวกรองที่ได้, fellBack + เหตุผล, askedModel, เวลา (ms) — ไฟล์ export ของหน้ากิจกรรมมีแค่เวลา ผู้ใช้ action และ summary (ไม่มี metadata) ซึ่งพอสำหรับชุดทดสอบ เพราะคำตอบที่ถูกเขียนใหม่โดยคนอยู่แล้ว

1. Export หน้ากิจกรรม แล้วกรองคอลัมน์ action = `project-card.question-search` ใน Excel
2. คนในทีมเขียน "คำตอบที่ถูก" ของแต่ละคำถาม เป็นไฟล์รูปแบบเดียวกับ `scripts/question-search-eval/questions.json` (`expect` = ตัวกรองบน URL, `expectAny` = ถูกได้หลายแบบ, `unsupported: true` เมื่อต้องมีหมายเหตุเรื่องจัดอันดับ/รวม/นับ) `asOfYear` (ปีที่ถาม ค.ศ.) มีได้ค่าเดียวต่อไฟล์ คำถามที่ถามคนละปีให้แยกไฟล์
3. รัน `run.ts <ไฟล์นั้น>` บน server
4. ได้ ≥ 90% exact และ ≤ 15 s ทุกข้อ → เปิดให้ทุกคนที่มีสิทธิ์ค้นหาโครงการ (เป็นการแก้โค้ดแยกอีกครั้ง: ตอนนี้ action และหน้าเช็ก `role === "ADMIN"`)
