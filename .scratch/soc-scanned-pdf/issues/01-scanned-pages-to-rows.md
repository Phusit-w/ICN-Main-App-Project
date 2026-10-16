# 01: Scanned table pages become rows (PDF converter + injected cell reader)

**What to build:** The PDF SOC converter accepts scanned table pages. For each scanned page it cuts the ruled table into cells with no OCR, hands every cell image to an injected cell reader, and returns rows, the source page of each row and upload warnings, in the same shape as a text PDF SOC. The grid cutter is ported from the prototype (`.scratch/soc-scanned-pdf/prototype/PROTOTYPE_grid.mjs`) with a lower ink threshold, because two short cells were called empty. A mixed PDF is read per page: text pages use the existing reader, scan pages use the cell reader, merged in page order. An all-text PDF never calls the cell reader. See spec and ADR 0010.

**Blocked by:** None (can start immediately)

**Status:** done (2026-10-16), not committed

- [x] A scanned-only PDF with a ruled table returns rows with item number, TOR text, offer, reference and remark, plus the PDF page of each row
- [x] Item number is taken from the start of the TOR text when the table has no item column
- [x] A table drawn inside a TOR cell becomes multi-line text in that same cell (one row)
- [x] A cell whose answer is only a figure makes the row an Image Row
- [x] A page whose grid cannot be cut is skipped and named in a warning; if more than half of the table pages cannot be cut the file is refused
- [x] A mixed text and scan PDF returns rows in page order, text pages from the existing reader
- [x] An all-text PDF never calls the cell reader; existing text PDF SOC tests still pass
- [x] Tests use a fake cell reader and small generated PDFs; no geometry assertions, no network

## Comments

- 2026-10-16: Done. `convertPdfSoc(pdf, { readCell })` (lib/soc-pdf-soc.ts); grid cutter in `lib/soc-scan-grid.ts` (ink threshold 0.004 → 0.001: on USO p1/p2 the short offer cells now have ink). Tests: `lib/soc-pdf-soc-scan.test.ts` (7, fake reader, rasters drawn by `test/pdf-table-fixture.ts` `raster`); all 18 PDF SOC tests, tsc and eslint pass. Real USO pages 1,2,3,7,30,49,68 cut to 4 columns, ~0.3 s a page.
- `CellReader = (png, {page,row,column}) => Promise<string | null>`; null = figure only. Ticket 02 must clean Typhoon output (drop `<figure>`, lone `---`, HTML table → `a | b` lines) before returning.
- Header row is read too (4 calls a page) because the header decides the columns.
- **Gap for the spec:** the Excel SOC reader has no Image Rows (only Word does; `rowImage` is null for .xlsx). A figure-only TOR cell is put in the .xlsx as a picture in that cell and the row stays if it has other text; the Excel reader will warn "มีรูป N รูปในไฟล์ Excel ที่ยังไม่อ่าน". A row with only a figure and no other text is dropped (the reader would drop it too). Real Image Rows for scanned PDF SOCs need an Excel-reader change: decide before ticket 10.
- Without `readCell` nothing changes (scans skipped/refused as before); lib/soc.ts does not pass one yet (ticket 03/07).
