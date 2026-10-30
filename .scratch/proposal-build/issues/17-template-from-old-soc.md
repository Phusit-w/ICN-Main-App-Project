# 17: สร้าง SOC Template จาก SOC เก่า

**What to build:** A new Proposal that has a TOR but no SOC Template can start from an old SOC: the user uploads a filled SOC (`.docx`) and the system makes a SOC Template from it (header row and one empty pattern row kept, data rows removed, fonts, column widths and page header kept), saves it in the template list, and สร้าง SOC can use it at once. Raised by the user 2026-10-30 while ticket 06 was being closed ("มี TOR แต่ไม่มี template SOC แต่มีตัวอย่างงาน SOC เก่า เอาเข้าระบบให้ทำ template แล้วทำ SOC ใหม่ได้ไหม").

**Blocked by:** 05 (done). Fits with 13 (real SOC formats); best after it so the cases below are known.

**Status:** needs-triage (needs a short design pass: where the button lives (SOC Template list and/or the สร้าง SOC step), whether the user previews the made template, how a header that lives in the page header or in a title row is told from a data row)

## Why it is not just "upload the old SOC as a template"

`assertSocTemplate` (`lib/soc-builder.ts`) needs a table whose **last row is an empty row of at least two cells** as the pattern the builder copies. A filled SOC has none, so it is refused today. Until this ticket the user cuts the old SOC down by hand in Word (what `output/SOC-Template-DOA-Apron-v3.docx` was).

## Cases to handle (from ticket 13's survey of 64 real SOC files)

- Header only in the page header (DOA): keep the page header, the table has title rows + data rows.
- Header or title rows inside the table (NT, PEA): which rows are header and which are data.
- Merged cells (NT, PEA merged reference column down the table; DOA merged section rows): the pattern row must be one ordinary row; vertical merges must not leak into it.
- Several SOC files for one TOR (NT 7 files, PEA ~16): the user picks the spec-table file.
- Pictures in cells: dropped from the pattern row.
- `.doc` input: needs Save As `.docx` first (ticket 16 would convert it); Excel and PDF SOCs cannot be a Word template (Excel output is ticket 15).

## Acceptance (to be set after the design pass)

- [ ] The template made from each Word SOC in `.scratch/proposal-build/fixtures/13-real-soc/` passes `assertTemplateFile` and, used by สร้าง SOC on a trimmed TOR, gives a draft whose table looks like the old SOC's (columns, fonts, header).
- [ ] The made template shows in the template list with a name the user chooses; the old SOC itself is not stored beyond the upload.
- [ ] A file with no table, or with no recognisable header row, is refused with a message that says what to do.
- [ ] Tests at the same seam as `lib/soc-builder.test.ts` and `test/soc-templates.test.ts`, with trimmed fixtures (never push the customers' full files; the fixtures folder is git-ignored).
