# 01: Upload a text PDF SOC and get an Excel SOC job

**What to build:** A reviewer uploads a text PDF SOC (as with Surat CASRI) with its evidence PDFs. The job is created with the same major items an Excel SOC of that table would have, and they can request a check of a major item as usual. Behind the scenes, the server's new PDF SOC converter reads the table and stores a generated `.xlsx` as the job's SOC document, and the original PDF is kept as the job's source PDF (ADR 0009). See `.scratch/soc-pdf-soc/spec.md`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] First, check that the `mupdf` package the web app already uses gives the table cells (ruling lines) and the text lines with positions for the Surat sample. If it can't, stop and report before building, and propose the PyMuPDF fallback through the server's Python.
- [x] The upload no longer refuses a PDF SOC. A PDF is recognised by its content, not its extension.
- [x] Cell text comes from the page's text lines placed into cells by position. Thai below-base vowels and tone marks match the PDF (the table finder's own cell text is not used).
- [x] The header is found by the same column names as the Excel reader, merged or stacked header cells included. The header row repeated on every page does not become a row.
- [x] A ✓ / √ in ตรงข้อกำหนด or ดีกว่าข้อกำหนด becomes the declared Comply or Better, and a PDF SOC without tick columns hides the tick UI.
- [x] A row cut across a page break stays two rows, and the second is unnumbered.
- [x] References in the หมายเหตุ column and SOCs divided into ผนวก behave as they do for Excel SOCs.
- [x] The generated `.xlsx` is stored as the job's SOC document, named after the PDF. The original PDF is stored as a new document type for a SOC's source PDF and is listed in the job's files.
- [x] The SOC Runner downloads the `.xlsx` and checks it with no Runner or Skill Package change. The existing Excel SOC version gate applies.
- [x] Tests at the converter seam use small generated PDFs (two pages with a repeated header, ticks, a page-break row). A job-creation test shows a PDF upload gives the same major items as the equivalent Excel SOC.
- [x] Existing Word and Excel SOC tests still pass. Lint and typecheck pass.

## Comments

2026-10-14 (done, committed, not pushed):
- mupdf spike passed, so there is no PyMuPDF fallback. A custom `mupdf.Device` collects the ruling lines: Word draws each cell border as a thin filled rectangle. `toStructuredText("preserve-whitespace")` gives each character with its position, and the Thai is intact.
- Converter: `lib/soc-pdf-soc.ts`. The header comes from `findSocHeader`, now exported from `lib/soc-table-excel.ts`, with whitespace removed from the names before matching, because Word writes "ตรง ข้อกำหนด".
- Line joining: when a page's broken lines end with their own space, as Word writes them, lines are joined as printed. That keeps mid-word breaks like "MJP|EG" whole. Otherwise a line break becomes a space, except between two Thai characters.
- Storage: the job's SOC is `<name>.xlsx`, the original is a `SOC_SOURCE_PDF` document, and `SocJob.socRowPages` holds the page of each row (migration `20261014120000_soc_pdf_soc_row_pages`). The file list shows the PDF in place of the `.xlsx`, and the PDF opens inline.
- Surat CASRI (manual run from `C:\Phusit\socpdf`):
  - 0.4 s, 332 rows.
  - Major items are the same 16 as the Word version (`1.1:15 … 4.10:9`).
  - All 310 numbered rows' TOR and proposal text equal the Word text exactly, spaces included. The Word file's one zero-width space is the only difference.
  - ✓ counts: Comply 204, Better 77.
  - The skill's `soc_table.py` reads the `.xlsx` as 332 rows, with the ✓ ticks as signals.
- For 02: `convertPdfSoc` returns `warnings: []`. Scanned pages and images are not detected yet. An all-scanned PDF gets the generic "ไม่พบตาราง SOC ในไฟล์ PDF" message for now.
- For 04: `socRowPages[i]` is the page of the Excel reader's SOC row `i + 1`. The converter test checks this alignment.
