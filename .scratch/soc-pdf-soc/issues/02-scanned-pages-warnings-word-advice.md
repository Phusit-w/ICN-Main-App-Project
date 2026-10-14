# 02: Scanned pages, upload warnings and the Word-file advice

**What to build:** A reviewer who uploads a PDF SOC is told what will not be checked. A PDF that is scans all the way through (like USO 4 School) is refused, with a message saying scanned PDF SOCs are not supported yet. In an otherwise text PDF, scanned pages are skipped and named in one warning. Pages with no table are skipped silently. Images in TOR cells are counted and reported. A damaged or password-protected PDF gets its own message. When the reviewer picks a PDF as the SOC file, the upload form advises "ถ้ามีไฟล์ Word ต้นฉบับ แนะนำให้อัป Word" without blocking. See `.scratch/soc-pdf-soc/spec.md` (Converter rules, Upload validation).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A page with no text layer counts as scanned. If every page is scanned, the upload is refused with "SOC นี้เป็น PDF แบบสแกน ระบบยังไม่รองรับ กรุณาอัปโหลดไฟล์ Word หรือ Excel ถ้ามี".
- [ ] When some pages are scanned, the job is created and one warning names them ("หน้า 58–59 เป็นภาพสแกน ไม่ได้ตรวจ").
- [ ] A text page with no SOC table is skipped without a warning. A PDF with no SOC table at all gets the existing no-table refusal.
- [ ] Images inside TOR cells are counted into one warning, worded like the Excel SOC's warning, and are not read.
- [ ] An unreadable or encrypted PDF is refused with its own message.
- [ ] Warnings appear on the job page where Excel SOC warnings appear, and do not block the upload.
- [ ] The upload form shows the Word-file advice only when the picked SOC file is a PDF.
- [ ] Tests at the converter seam cover: all scanned, some scanned, a page with no table, a TOR-cell image, encrypted.
- [ ] Manual check: the USO 4 School PDF is refused with the scanned message.

## Comments
