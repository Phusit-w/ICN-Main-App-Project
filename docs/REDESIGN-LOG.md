# บันทึกงานปรับ Design ใหม่ (2026 UI redesign)

เอกสารนี้เป็น **living log** ของงานเปลี่ยนหน้าตา/UI ของ `expense-billing-app` — ทำต่อเนื่องหลายเซสชัน
เริ่ม 2026-08-27 อัปเดตทุกครั้งที่ทำเพิ่ม

---

## เป้าหมาย

เปลี่ยนหน้าตาเป็นสไตล์ modern SaaS ตามที่ออกแบบไว้ใน Claude Design
(ชุด handoff `../../Web app selector UI mockups-handoff/` — artboard Turn 2–6)
**โดยระบบ/ตรรกะเดิมไม่แตะ** (data, server actions, auth, print/PDF, pagination)
และวางโครงให้ **เพิ่มระบบ/แอปอื่นในอนาคตได้ง่าย**

- Plan file (เครื่อง dev): `C:\Users\phusit.w\.claude\plans\melodic-waddling-puzzle.md`
- current-state audit ของเดิม: `docs/ux-audit/CURRENT-UI-AUDIT.md` (+ screenshots)
- Branch: **`redesign/foundation`** (แยกจาก `main`) — **ยังไม่ merge, ยังไม่ deploy**

---

## Decisions ที่เคาะแล้ว (จากการถาม-ตอบกับผู้ใช้)

| เรื่อง | สรุป |
|---|---|
| ระบบ token/สไตล์ | **เปิดใช้ Tailwind v4** (`@import "tailwindcss"` + `@theme` ใน `app/globals.css`) — inline `style={{}}` เดิมอยู่ร่วมกันได้ ทยอยแปลง |
| Login | **Split-panel เรียบ** (พาเนลดำซ้าย + ฟอร์มขาวขวา ปุ่มดำ) — **ไม่มี** mascot/animation (เก็บไว้เป็น polish รอบเสริม) |
| Dashboard | **เลื่อนออก** — การ์ดสถานะอนุมัติ/แจ้งเตือน/กราฟ/แอปที่ใช้ล่าสุด ไม่มี schema รองรับ; ทำตอนมี workflow อนุมัติจริง แล้วค่อยเพิ่ม `/dashboard` ดันเป็น `/` |
| `/` (landing) | **Applications launcher** (การ์ดเลือกเครื่องมือ) — หน้ารายการทั้งหมด (History) ย้ายไป **`/records`** |
| กระดาษ FA017/FA018 | **ไม่แตะ** — ตาราง 1px ดำ A4 1:1 (`FA017Form.tsx`/`FA018Form.tsx` ผูกกับ `lib/pagination.ts` + `lib/exportPdf.ts`) เปลี่ยนแค่ shell/toolbar รอบกระดาษ |
| Mobile/responsive เต็มแอป | ไม่อยู่ในขอบเขต (shell + login ทำ responsive พื้นฐานพอ) |
| Dark mode | ไม่อยู่ในขอบเขต |

---

## สถานะ merge/deploy

- **2026-08-28: merge เข้า `main` แล้ว** (fast-forward จาก `31f3a1a`) — `redesign/foundation` sync ตาม `main` ตลอด
- redesign หลัก + งานต่อเนื่อง **push `origin/main` แล้ว** ถึง `597d1ea` · หลังจากนั้น `/settings` (`fd10b88`) และ theme toggle (`ae8e8c2`) commit บน `main` — **ยังไม่ push, ยังไม่ deploy** ขึ้น `psaidemo.icn21.local`
- ไม่มี migration — แตะแค่ frontend + `next.config.ts` + `proxy.ts` (ไม่มี `prisma/`) → DB ไม่เปลี่ยน
- follow-up ที่ปิดไปแล้วด้วยงานนี้: standalone `next/image` โลโก้ spam `service-err.log` — round 1 ใส่ `images:{unoptimized:true}` แก้แล้ว
- deploy รอบนี้จะพา 3 ของใหม่ขึ้นด้วย: `/` = launcher, รายการย้าย `/records`, มี `/settings` + ปุ่มสลับธีมสว่าง/มืด

## สิ่งที่ทำเสร็จ — บน `main`

| commit | รอบ | เนื้อหา |
|---|---|---|
| `fe4dd1c` | **1 — ฐานราก + shell + login** | เปิด Tailwind v4 + `@theme` (สี/radius/shadow จาก mockup) · ฟอนต์ Poppins + IBM Plex Sans Thai ผ่าน `next/font` (ถอด Sarabun) · route group `app/(app)/` + `layout.tsx` กลาง · `AppSidebar` (rail ดำ floating 80↔230px hover overlay ไม่ดันเนื้อหา) · `AppTopBar` (breadcrumb + กระดิ่ง + avatar) · `lib/nav.ts` (config array แทน `<Link>` ตายตัว) · `components/icons.tsx` (inline SVG) · `components/ui/{Button,Card,Field}.tsx` · `LoginForm` split-panel (ตรรกะ auth เดิมไม่แตะ) · ลบ `Header.tsx` · `PageShell` โปร่ง · `next.config.ts` `images:{unoptimized:true}` (แก้ log spam โลโก้ standalone ค้างเดิมด้วย) · `public/icn-logo-white.png` + allow-list ใน `proxy.ts` |
| `30d4d05` | **2a — หน้ารายการทั้งหมด** | page header (Poppins) + ปุ่ม action + 4 stat card (คำนวณจาก records จริง) · `RecordsTable` (Card wrapper + segmented filter F-FA-017/F-FA-018) · `ProfileCard` · `components/ui/Modal.tsx` + `ConfirmDialog`/`ConfirmSaveModal`/`ConfirmLogoutModal` เขียนใหม่บน Modal · `Button` เพิ่ม variant `dangerSolid` · `SavedEmployeePicker`/`SavedListManager` |
| `0a262f8` | **2b — หน้ากรอกข้อมูล FA017/FA018** | `EntryEmployeeFields` + `EntryFormFA017` + `EntryFormFA018` เป็น token set (ฟอร์มหนัก 2 ตัวแก้ในที่ ตรรกะ draft/travel-handoff/saved-item ไม่แตะ) |
| `dc288ea` | **3 — คำนวณค่าเดินทาง** | `TravelCalculator` (`/travel`) + `TravelRowCalculatorPanel` (เวอร์ชันย่อในฟอร์ม) — hook / fixed+meter mode / sessionStorage handoff ไม่แตะ |
| `a7149ca` | **4 — toolbar หน้าฟอร์ม** | `EditorToolbar` → white `<Card>` เหนือกระดาษ (ปุ่มบันทึกส้ม, สร้างฟอร์มใบรับรอง lavender) · `BillEditor` ควบคุม "ประจำเดือน" FA018 · **กระดาษ A4 / `@page` / pagination / PDF export ไม่แตะ** |
| `9a3d769` | **5+6 — Applications launcher + ย้าย History** | `app/(app)/page.tsx` = launcher (การ์ด Expense Claim / ใบรับรองแทนใบเสร็จ / คำนวณค่าเดินทาง / รายการทั้งหมด + "ตรวจสอบ SOC — เร็วๆ นี้" disabled) · History → `app/(app)/records/page.tsx` (`/records`) · `BillEditor` `router.push("/")` → `/records` (2 จุด) · `lib/nav.ts` เพิ่ม flag `disabled` ("ตั้งค่า" เป็น placeholder เทา) · `globals.css` ย้าย `a { color }` เข้า `@layer base` (ไม่งั้น `text-ink` บน `<Link>` ที่ทำเป็นปุ่ม/การ์ด แพ้ rule ที่ไม่ layered → ลิงก์เป็นสีน้ำเงิน) · เพิ่ม `ShieldIcon` |
| `744314b` | **docs** | เพิ่มไฟล์ log นี้ |
| `54e4b95` | **followup (รีวิวก่อน merge)** | `actions/records.ts` `revalidatePath("/")` → `"/records"` 4 จุด (create/update/delete/duplicate — round 5+6 ย้ายรายการออกจาก `/` แต่ลืม repoint; ไม่เห็นเป็นบั๊กเพราะ `/records` เป็น `force-dynamic` + `RecordsTable` `router.refresh()`) · เก็บคอมเมนต์ค้างใน `PageShell.tsx` + `globals.css` (อ้าง `Header.tsx`/`.nav-btn`/`.btn-danger` ที่ลบไปแล้ว) |
| `ad60b78` | **fix (เจอตอนรีวิวหน้าจริง)** | หน้า launcher `/` โชว์ avatar เป็น "?" ให้ทุกคน (รวม prod) — เพราะเป็น route เดียวใน `(app)` ที่ตั้ง `dynamic = "force-static"`; layout กลางอ่าน session cookie มาโชว์ชื่อบน topbar แต่ `force-static` ทำให้ `cookies()` คืนค่าว่าง → prerender ครั้งเดียวตอน build ด้วย `displayName=null`. แก้เป็น `force-dynamic` ให้เหมือน route อื่น (launcher ไม่มีข้อมูล build-time อยู่แล้ว) |
| `597d1ea` | **push origin** | redesign + followup ขึ้น `origin/main` ถึงจุดนี้ |
| `fd10b88` | **`/settings` v1** | "ตั้งค่า" ใน sidebar ใช้งานได้ (`lib/nav.ts` flip disabled→`/settings`) · `app/(app)/settings/page.tsx` (`force-dynamic`) · `DefaultEmployeeSetting` = ProfileCard แบบย่อ (แค่ picker + ค่าปัจจุบัน) reuse `rememberLastEmployee` · v1 มีหัวข้อเดียว "ค่าเริ่มต้นผู้กรอก" |
| `ae8e8c2` | **theme toggle** | ปุ่มสลับสว่าง/มืดใน `AppTopBar` (`ThemeToggle` — pill เลื่อน sun/moon) · cookie `theme` อ่านใน `(app)/layout.tsx` → `data-theme` บน `.app-shell-root` (SSR = ไม่แฟลช) · dark palette = บล็อกเดียว `.app-shell-root[data-theme="dark"]` override `--color-*` ใน `globals.css` · scope แค่ shell → `/login` + กระดาษ A4 คง light เสมอ · `lib/theme.ts` ใหม่ · แก้ contrast ~10 จุด (`text-ink`→`text-black`/`text-ground` บนพื้นที่ไม่ flip, sidebar active, dark link เข้า `@layer base`, `focus:border-[#181818]`→`focus:border-ink` + token `--ring-focus`) |

**สถานะ:** ทุกหน้าปรับเป็นสไตล์ใหม่ครบแล้ว · merge เข้า `main` แล้ว · `/settings` + theme toggle เพิ่มหลัง merge (ดูหัวข้อ "สถานะ merge/deploy") — ที่เหลือเป็นของสร้างใหม่ล้วน (ดูหัวข้อถัดไป)

### Validation (ทุก commit)

- `npm run build` ผ่าน · `npm run typecheck` สะอาด
- `npm run lint` — **13 ปัญหา** (baseline เดิม 15; 6 error เดิมทั้งหมดใน `FA017Form`/`FA018Form` `remeasure` — pre-existing; ไฟล์ใหม่ไม่เพิ่มปัญหา บังเอิญเก็บ unused-var เดิมไป 2)
- เช็คในเบราว์เซอร์ทุกหน้า (`/`, `/records`, `/travel`, `/bill/entry/fa017`, `/bill/entry/fa018`, `/bill/[id]` editor, `/settings`, `/login`) — ไม่มี console error / CSP violation / hydration error (รวมเช็คบน production standalone build ด้วย)
- theme (`ae8e8c2`): เดินทุกหน้า shell + 1 modal ทั้ง light และ dark บน standalone prod build — สลับทันทีไม่ reload/แฟลช, reload แล้ว persist, `/login` คง light, กระดาษ A4 ขาวใน dark
- warning dev-only ที่เหลือ: `Image "icn-logo.png" width/height modified` × ใน `FA017Form`/`FA018Form` (โลโก้แดงในกระดาษ A4) — pre-existing ไฟล์ไม่ได้แตะ ไม่บล็อก

---

## ยังไม่ได้ทำ

- **Dashboard จริง** (Turn 2a) — เลื่อนตาม decision ข้างบน ต้องมี:
  - `ExpenseRecord.status` enum (Approved/Pending/Returned) + จุดที่เซ็ต
  - แหล่ง notification
  - aggregation query สำหรับกราฟยอดรายเดือน
  - log การใช้แอป (สำหรับ "แอปที่ใช้ล่าสุด")
  ทำเมื่อมี workflow อนุมัติในระบบจริง แล้วเพิ่ม `/dashboard` → ดันเป็น `/` (launcher ย้ายไป `/apps` หรือเป็น section ใน dashboard)
- **mascot login แบบ animated** (`Login.dc.html`) — polish รอบเสริม; ตอนนี้เป็น split-panel เรียบ
- ~~ธีม light/dark~~ **เสร็จแล้ว** (`ae8e8c2`) — ค่าเริ่มต้น light, สลับด้วยปุ่มใน topbar, ไม่มีโหมด "ตามระบบ" · dark hex ใน `globals.css` เป็น first pass ปรับได้ · จุดที่ยัง soft: `--color-accent`/`peach`/`lavender` คง light ทั้งสองธีมโดยตั้งใจ
- เมนู "เอกสารเก่า" ใน mockup Turn 6a — ยังไม่ทำ (ความหมายไม่ชัด ไม่มีของจริงรองรับ)
- **`/settings` v1 เสร็จแล้ว** (`fd10b88`): "ตั้งค่า" ใน sidebar ใช้งานได้จริง — v1 มีหัวข้อเดียว "ค่าเริ่มต้นผู้กรอก" (`DefaultEmployeeSetting` = ProfileCard แบบย่อ, reuse `rememberLastEmployee`) · Account section (ชื่อ+logout) กับ "จัดการข้อมูลที่บันทึกไว้" ยังไม่ใส่ (drop-in ทีหลังได้)
- avatar ใน topbar: prod มี session จริงจะโชว์ initials แล้ว (บั๊ก "?" บนหน้า `/` แก้ใน `ad60b78`) — เหลือแต่ตอน dev ที่ยังไม่ได้ login จริงจะเห็น "?" (เพราะ dev bypass auth); ปรับเป็น fallback icon ได้ถ้าอยาก

---

## วิธีทำต่อครั้งหน้า

### เปิด dev
```powershell
cd "...\Main_Project_Build_App"
npx.cmd prisma dev start pilot-db -P 51218 --shadow-db-port 51219 -d   # ถ้ายังไม่ขึ้น
npm.cmd run dev
```
(ดู `docs/DEV-START.md` — dev ข้าม login อัตโนมัติ)
งาน redesign หลัก merge เข้า `main` แล้ว — ทำงานบน `main` ต่อได้เลย (`redesign/foundation` = สำเนาที่ sync ไว้)

**หมายเหตุ dev:** อย่า `rm -rf .next` ตอน `next dev` รันอยู่ — server จะขึ้น "(stale)" ต้อง restart;
`npm run typecheck` แบบ standalone หลังลบ `.next` จะ error `Cannot find name 'LayoutProps'` (Next
gen types หาย) — รัน `npm run build` ก่อน 1 รอบให้มัน regenerate

### token / รูปแบบที่ใช้อยู่
- token อยู่ใน `@theme` ของ `app/globals.css` (`--color-*`, `--radius-*`, `--shadow-*`, `--font-display`/`--font-sans`)
- component กลาง: `components/ui/{Button,Card,Field,Modal}.tsx` · icon: `components/icons.tsx` · nav: `lib/nav.ts`
- ปุ่มใหม่ใช้ `<Button variant=... />` (มี class `ui-btn` ที่ globals.css ยกเว้นจาก rule hover ดำ)
- `<Link>` ที่ทำเป็นปุ่ม/การ์ด **ต้องใส่ `text-ink no-underline`** เอง

### deploy (ค้างอยู่ — merge เข้า `main` แล้ว ยังไม่ push/deploy)
1. ✅ merge เข้า `main` (`31f3a1a..ad60b78`, fast-forward)
2. `git push origin main` (นำหน้า `origin/main` 9 commit)
3. `git push backup main --force` — sync remote `backup` ที่ diverge ค้างจาก session ก่อน
4. **ไม่มี migration** — แตะแค่ frontend + `next.config.ts` + `proxy.ts` (ไม่มี `prisma/`) → DB ไม่เปลี่ยน
5. deploy ตาม `docs/SESSION-LOG-2026-08-27.md` ส่วนที่ 4: `git archive --format=zip -o ..\expense-billing-app-deploy.zip HEAD` → copy ไปเซิร์ฟเวอร์ → extract ทับ `C:\Apps\expense-billing-app-deploy` → รัน `.\deploy\windows\update.ps1`
6. **แจ้งผู้ใช้:** `/` เปลี่ยนเป็นหน้า launcher, หน้ารายการทั้งหมดย้ายไป `/records` — bookmark เดิมจะเปลี่ยน

### ไฟล์ที่แตะทั้งหมดในงานนี้ (`git diff --stat 31f3a1a..ad60b78`)
41 ไฟล์ · +2147 / −2042 — สรุป: สร้าง `app/(app)/{layout,page,records/page}.tsx`,
`components/{AppSidebar,AppTopBar,icons}.tsx`, `components/ui/*`, `lib/nav.ts`, `public/icn-logo-white.png`;
ลบ `components/Header.tsx`, `app/page.tsx` (ย้าย); เขียนใหม่/ปรับ component เดิมเกือบทั้งหมด +
`app/globals.css`, `app/layout.tsx`, `next.config.ts`, `proxy.ts`, `actions/records.ts`
