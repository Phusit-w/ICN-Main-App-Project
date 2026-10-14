# Spec: Text PDF SOCs

Status: ready-for-agent

Grilled 2026-10-14. The vocabulary is in `docs/SOC-DOMAIN-GLOSSARY.md` (PDF SOC, Scanned PDF SOC, Excel SOC), and the main decision is in ADR 0009 (a PDF SOC is turned into an Excel SOC on upload). Checks still run on the reviewer's machine (ADR 0008).

## Problem Statement

Some jobs give the reviewer the SOC only as a PDF. Sometimes it is a Word SOC that was exported to PDF (Surat Thani CASRI, 59 pages, with a text layer). Sometimes it is a scan (USO 4 School, 85 pages, images only). Today the upload form refuses every PDF SOC with "ยังไม่รองรับ SOC ที่เป็น PDF", so these jobs cannot use the system at all. The reviewer has to check them entirely by hand.

## Solution

The reviewer uploads a text PDF SOC the same way as a Word or Excel SOC. At upload, the server reads the comparison table from the PDF and turns it into an Excel SOC that the job keeps beside the original PDF. From then on the job is an ordinary Excel SOC: it is split into the same major items, checked by the same SOC Runner and skill, reviewed on the same page, and exported to the same results Excel. Each row remembers the PDF page it came from, and the review page can show that page. Table pages that are scans are left out and named at upload. A PDF that is scans all the way through is refused for now. Scanned PDF SOCs are the next feature.

## User Stories

Upload

1. As a reviewer, I want to upload a PDF SOC with its evidence PDFs exactly as I upload a Word or Excel SOC, so that PDF-only jobs can use the system.
2. As a reviewer, I want to upload the PDF itself and not convert it to anything first, so that the PDF needs no extra step from me.
3. As a reviewer, I want the upload form to say "ถ้ามีไฟล์ Word ต้นฉบับ แนะนำให้อัป Word" when I pick a PDF SOC, so that I use the Word file when I have it and get the SOC_Check copy and Image Rows read.
4. As a reviewer, I want that note to be advice only, so that I can still go on with the PDF.
5. As a reviewer, I want a PDF SOC whose pages are all scans refused with a message saying scanned PDF SOCs are not supported yet, so that I don't wait for a check that cannot run.
6. As a reviewer, I want a PDF with no SOC table refused at upload, so that I find out before I spend quota.
7. As a reviewer, I want a PDF that cannot be opened (damaged or password-protected) refused with a clear message, so that I know to fix the file.
8. As a reviewer, I want scanned pages in an otherwise text PDF left out and named at upload ("หน้า 58–59 เป็นภาพสแกน ไม่ได้ตรวจ"), so that one signed page does not block the whole job and I know which pages to check myself.
9. As a reviewer, I want pages with no table (cover, signature page) skipped without a warning, so that warnings show only things I must act on.
10. As a reviewer, I want images inside the TOR cells counted and reported at upload, not read, so that I know to look at them myself.
11. As a reviewer, I want these warnings not to block the upload, so that the text rows are still checked.
12. As a reviewer, I want the PDF SOC's warnings shown on the job page like an Excel SOC's warnings, so that I find them in the usual place.

Reading the table

13. As a reviewer, I want the TOR, proposal and reference text read exactly as printed, Thai vowels and tone marks included, so that what Claude checks and what I review is the real text.
14. As a reviewer, I want the header row repeated on every page dropped, so that headers do not become SOC rows.
15. As a reviewer, I want the header found from the column names, as for an Excel SOC, so that layouts with title lines and stacked header rows still work.
16. As a reviewer, I want a ✓ in the ตรงข้อกำหนด or ดีกว่าข้อกำหนด column read as the declared Comply or Better, so that the declaration is checked as it is for Word and Excel SOCs.
17. As a reviewer, I want a PDF SOC with no tick columns to hide the tick UI, so that it behaves like any SOC without a Comply column.
18. As a reviewer, I want item numbers kept as typed (๑.๑.๓ or 1.1.3), so that they match the document I submit.
19. As a reviewer, I want a row's item number taken from the start of its TOR text when the table has no item-number column, so that SOCs that write the number in the requirement text still split into major items.
20. As a reviewer, I want the item-number column used whenever there is one, so that a number that only appears inside the TOR text never overrides it.
21. As a reviewer, I want a row cut across a page break kept as two rows, the second unnumbered, so that the rows are predictable and the second part is still checked with its requirement.
22. As a reviewer, I want references in the หมายเหตุ column picked up as they are for Word and Excel SOCs, so that the layout of the PDF does not lose references.
23. As a reviewer, I want a SOC divided into ผนวก recognised in a PDF as it is in Word and Excel, so that each ผนวก is one major item.

Checking and review

24. As a reviewer, I want a PDF SOC split into major items by the existing rule, so that request, progress, ไม่ต้องตรวจ and re-checks work as usual.
25. As a reviewer, I want a PDF SOC checked by my SOC Runner without re-installing it, so that I can use the feature the day it is deployed.
26. As a reviewer, I want a PDF SOC checked by the same rules as Word and Excel SOCs, so that verdicts mean the same thing in all three.
27. As a reviewer, I want no SOC_Check copy to be required for a PDF SOC, so that a run is accepted with its results alone, as for an Excel SOC.
28. As a reviewer, I want a "ดูหน้า PDF SOC" button on every row of the review page that opens the page of the original PDF the row came from, so that I can confirm the table was read right.
29. As a reviewer, I want the PDF page shown inside the review page as evidence pages are, so that I don't leave the review to check it.
30. As a reviewer, I want re-check of picked rows, ไม่ต้องตรวจ, รอแก้ไข and manual import to work on a PDF SOC, so that nothing I rely on is missing.
31. As a reviewer, I want the results Excel for a PDF SOC to look like the one for an Excel SOC, so that I share the same kind of file.
32. As a reviewer, I want the job's files to list the original PDF SOC, so that I know which document the job was made from.

Operations

33. As an admin, I want existing jobs and results unchanged, so that deploying this needs no data repair.
34. As an admin, I want no new SOC Runner or Skill Package version needed, so that reviewers do not re-paste the install command.
35. As an admin, I want PDF SOCs trashed and purged with their job like any other SOC file, so that storage rules stay the same.

## Implementation Decisions

Seams

- **The SOC table reader stays the one seam.** Its interface stays "SOC file bytes in; major items, row texts and upload warnings out". A new **PDF SOC converter** sits in front of it: PDF bytes in; a generated `.xlsx`, the PDF page of each row, and upload warnings out. Job creation calls the converter when the upload is a PDF and then treats the generated `.xlsx` as the uploaded SOC. Nothing downstream (major-item split, Check Requests, Runner download, skill, review page, results Excel) learns about PDFs, apart from the "ดูหน้า PDF SOC" button.
- The converter runs inside the web app on the `mupdf` package it already uses to render evidence pages. It needs no Python on the upload path. If that package cannot give the table cells, the first ticket reports this before building on it, and the fallback is PyMuPDF through the server's existing Python.

Converter rules

- Table cells come from the table's ruling lines on each page. Cell text comes from the page's text lines, placed into cells by position. The table finder's own cell text is not used, because it drops Thai below-base vowels (ุ ู) onto separate lines. On the Surat sample, the line text is correct and the cell text is not.
- The header is recognised by the same column names as the Excel reader (item, TOR, proposal; reference and tick columns optional). Header rows repeated on later pages are dropped. Merged and stacked header cells are handled, as in the Surat sample where ตรงข้อกำหนด and ดีกว่าข้อกำหนด sit under one ข้อเสนอ heading.
- A tick cell holding ✓, √ or another check mark is a tick.
- When the table has no item-number column, the item number is the leading number of the TOR text (Thai or Arabic digits, dotted). It is written into the item column of the generated `.xlsx` and left in the TOR text, so the skill needs no change.
- A row continuing at the top of the next page stays a separate unnumbered row.
- Page kinds: a page with a text layer and a SOC table is read. A page with a text layer and no table is skipped silently. A page with no text layer (only images) is a scanned page. If every page is scanned, the upload is refused as a Scanned PDF SOC. Otherwise the scanned pages are skipped and named in one warning.
- Images inside TOR cells are counted and reported in one warning, using the Excel SOC's warning wording. They are not read.
- The generated `.xlsx` has one visible sheet. Its header names are ones the Excel reader and the skill's Excel reader both recognise, and it contains only the SOC's own columns, so no extra column can be mistaken for a reference column.

Storage

- The generated `.xlsx` is the job's SOC document (`type` SOC, Excel mime type), named after the PDF with `.xlsx`. The SOC Runner downloads it as it does for any Excel SOC.
- The original PDF is stored as another document of the job with a new document type for the source PDF of a SOC. The job's file list shows it. Trash and purge already cover every document of a job.
- The PDF page of each SOC row is stored with the job in a new nullable field: a list giving each SOC row number its PDF page. This is an additive migration, and existing jobs have no value. The page is not written into the `.xlsx`, so neither reader can mistake it for SOC content.

Upload validation

- The "PDF SOC is not supported" refusal is removed. A PDF is recognised by its content (`%PDF`), not by its extension.
- Messages: scanned throughout → "SOC นี้เป็น PDF แบบสแกน ระบบยังไม่รองรับ กรุณาอัปโหลดไฟล์ Word หรือ Excel ถ้ามี". No table found → the existing no-table message. Unreadable or encrypted → its own message.
- The upload form shows the Word-file advice when the picked SOC file is a PDF.

Review page

- When the job has a source PDF and the row has a page, the row shows "ดูหน้า PDF SOC". It renders that page with the existing page renderer through an authorised route, the same way evidence pages are shown.

Versions

- No SOC Runner or Skill Package change. A Runner that is too old for Excel SOCs is already refused by the existing Excel SOC version gate, which covers PDF SOCs because their SOC document is an `.xlsx`.

## Testing Decisions

- Test external behaviour at the converter seam: PDF bytes in → rows (item, TOR, proposal, reference, ticks), row pages and warnings out. Then through job creation: a PDF upload creates the same major items as the equivalent Excel SOC. Do not test the line-to-cell geometry directly.
- Fixtures: small PDFs made for the tests (a text table across two pages with a repeated header, a table without an item column, a page that is only an image, a page with no table). Generate them from code or keep them tiny. Run the Surat CASRI PDF from a short local work path as a manual acceptance check. It is not committed, because of its size and MAX_PATH.
- Acceptance on Surat CASRI: every row of the PDF appears once, Thai text matches the PDF exactly on a sample of 20 rows (marks included), the ✓ columns match, the major items match those of the Word or Excel version of the same SOC if one exists, and one major item checked live by a SOC Runner imports without error.
- Prior art: the Excel SOC tests (`soc-table-excel` tests), the upload tests (`soc-upload` tests) and the major-item tests.
- Run the existing SOC test suite to confirm Word and Excel jobs behave as before. Remember that the prisma dev test DB must use a fresh name.

## Out of Scope

- Scanned PDF SOCs (OCR on the server, or Claude reading page images on the Runner). This is the next feature. It starts with `/prototype` on the USO 4 School PDF and is expected to produce the same generated `.xlsx`.
- Reading images inside TOR cells of a PDF SOC (they belong with the scanned work).
- A SOC_Check copy for PDF SOCs.
- A download link for the generated `.xlsx`.
- Merging a row cut across a page break.
- `.doc` and `.xls` uploads (unchanged: refused with the Save As message).

## Further Notes

- Samples (read-only; copy to a short path before use): text = Surat CASRI "(1)06 G1-04-T2 Technical Compliance Comparison Table Surat CASRI-0923 - v2 (Word) - fixed.pdf" under `C:\Phusit\ICN_PC\DOA\4. DOAXXX_Apron…\Proposal A\2. ตารางเปรียบเทียบคุณลักษณะเฉพาะทางเทคนิค (Compliance Threshold)\`. Scanned = "ตารางเปรียบเทียบข้อกำหนด TOR.pdf" under `Example SOC+TOR+Datasheet\2. NBTC_USO 4 school\GMesh\DATA SHEET (06102026)\drive-download-…\`.
- Probe 2026-10-14 (PyMuPDF 1.28.2): Surat has 59 landscape pages, a text layer and one table on every page, 15 raw grid columns, ✓ extracted as text, and fonts TH SarabunNew / TH SarabunIT๙. USO has 85 pages, each one image with no text, no item column (numbers inside the TOR text) and an empty reference column on the pages seen.
- The earlier spec (`.scratch/soc-image-rows/spec.md`, story 44) refused PDF SOCs on purpose. This spec replaces that refusal for text PDFs only.
