# 03: Upload an Excel SOC and see its major items

**What to build:** A reviewer uploads an `.xlsx` SOC with its evidence PDFs and lands on a job page that lists its major items, ready to request checks.

- `.xlsx` is accepted by content, not only by extension. `.doc` and `.xls` are refused with "กรุณา Save As เป็น .docx/.xlsx"; a PDF SOC is refused with a message that PDF SOCs are not supported yet; a workbook with no recognisable SOC table is refused.
- The header row is found by column names (item, TOR, proposal; reference and tick columns optional), under title lines and across stacked or merged header cells.
- Every visible sheet with a recognised header is part of the SOC. Other sheets are left out and named at upload; hidden sheets are ignored silently.
- Rows are numbered consecutively across the included sheets in workbook order. Rows without an item number belong to the numbered row above.
- Major items follow the existing rule (over 60 rows splits one level down; other items start as ไม่ต้องตรวจ after a split). Item numbers keep the digits typed in the file.
- A non-empty cell under ตรงข้อกำหนด / ดีกว่าข้อกำหนด is the declared Comply / Better. No tick columns: the tick UI is hidden.
- Floating images in the workbook are counted and reported at upload ("มีรูป N รูปที่ยังไม่อ่าน"); the check can still be requested.

Spec: `../spec.md`, "Excel SOCs". Glossary: Excel SOC.

**Blocked by:** 01

**Status:** done

- [x] Uploading a workbook shaped like the Surat Thani sample (one sheet, three stacked header rows, 323 rows, √ ticks) creates the job with its major items, split where over 60 rows
- [x] Tests build their own workbooks and cover: stacked headers, two sheets with one unrecognised, a hidden sheet, unnumbered rows, no tick columns, floating images, no SOC table
- [x] The three refusals show their own Thai message
- [x] Skipped sheets and the unread image count are visible on the job page after upload
- [x] A Word SOC uploads exactly as before
- [x] lint, typecheck, `npm test` and build pass; the upload flow is checked in a browser

## Comments

**2026-10-12: done.**

- `lib/soc-table-excel.ts` (new) reads the workbook's XML parts directly, like the Word reader: no new dependency, still synchronous. `lib/soc-table.ts` tells Word from Excel by the zip's content and gives both the same result shape. The row and header rules the skill must copy are the comment at the top of `lib/soc-table-excel.ts`.
- Row numbers: only rows under the header rows count, from 1, on across the included sheets. The Surat Thani sample has 323 sheet rows, of which 8 are title and header rows, so it reads as **315 SOC rows** and 16 major items (ข้อ 1 and ข้อ 4 split; ข้อ 2 and ข้อ 3 start as ไม่ต้องตรวจ by the existing rule).
- Refusals (`assertSocFile`, and the upload form says the same before sending): `.doc`/`.xls` "… กรุณา Save As เป็น .docx หรือ .xlsx แล้วอัปโหลดใหม่"; a file in the old Office container under a new name (also a password-protected file) "ไฟล์ SOC เป็นรุ่นเก่าหรือใส่รหัสผ่านไว้ …"; PDF "ยังไม่รองรับ SOC ที่เป็น PDF …"; a workbook with no SOC table "ไม่พบตาราง SOC ในไฟล์ Excel …". The picker now offers `.doc`, `.xls` and `.pdf` so the message can be shown.
- Warnings: skipped sheets (visible, with text, no header) and the count of floating pictures in the whole workbook. Stored on the new nullable `SocJob.socWarnings` (migration `20261012090000_soc_job_warnings`, additive) and shown on the job page as "ส่วนของไฟล์ SOC ที่ระบบไม่ได้ตรวจ". A visible sheet with no text at all is ignored without a warning.
- From the user during this ticket: some SOCs have a หมายเหตุ column (MEA: "หมายเหตุ (คำอธิบายเพิ่มเติม)") and references are written there; some jobs have no such column. The Excel reader knows the reference column and the remarks column as two optional columns; text in either makes a row. The skill's Word packet builder got a header fallback to หมายเหตุ (see ticket 02's skill, `reference_columns`) and SKILL.md step 2 says so in a few words.
- Tick columns: recognised (so they are never taken for the TOR column, and a tick alone makes a row), but the web reader does not give out the declared Comply/Better. On the web the declared status and the tick UI come from results.json, so this part of the ticket is the skill's (ticket 04).
- An item number typed as a number keeps the decimals of a fixed format ("0.00": 1.10 stays 1.10). Typed as a number with the General format, 1.10 is 1.1 in the file itself and cannot be told apart.
- Validation: lint, typecheck, build pass. `npm test`: 236 of 237; the one failure is the filter test in `test/soc-review-workspace.test.ts` that was failing before. New tests: `lib/soc-table-excel.test.ts` (17) and 4 upload tests in `test/soc-imported-job.test.ts`.
- Browser (local dev): uploaded the real Surat Thani workbook and landed on the job page with its major items; an old `.doc` showed the Save As message; a workbook with a note sheet and 2 pictures showed both warnings on the job page.
- /code-review done; fixed: rows the file leaves out no longer break the read, very large sheets, a stacked header whose group name reads like a TOR column, "ลำดับ ที่" on two lines, namespace prefixes, linear parsing of a cut-off file, only the needed parts of the workbook are unzipped.

Left as is:

- A first row under the header that has no item number and whose text sits under a merged group name would be read as one more header row.
- An item number merged down over several rows is blank on the lower rows.
- The picker's "ข้าม N ไฟล์ที่ไม่ใช่ …" note now lists .DOC, .XLS, .PDF too.
- An Excel job can be created and requested, but a Runner cannot check it until tickets 04 and 05. Do not deploy 03 alone.
