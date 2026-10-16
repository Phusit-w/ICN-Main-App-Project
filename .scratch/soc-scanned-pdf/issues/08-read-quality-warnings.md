# 08: Quality warnings after the read

**What to build:** There is no per-row human confirmation, so when the read finishes the job warns about likely misreads: gaps or duplicates in item numbers, empty TOR cells, and doubled words in a cell. The warnings appear with the other upload warnings and name the rows or pages. See spec and ADR 0010.

**Blocked by:** 03

**Status:** done (2026-10-16)

- [x] A missing item number in a sequence and a repeated item number each produce a warning that names them
- [x] A row whose TOR cell is empty produces a warning that names the row and page
- [x] A cell with a word repeated twice in a row produces a warning
- [x] A clean read produces none of these warnings
- [x] Tests use the fake cell reader with crafted answers

## Comments

- 2026-10-16: Done. lib/soc-scan-quality.ts (pure), called at the end of convertPdfSoc for rows of scanned pages only; warnings join the upload warnings. Item gaps/repeats are checked per parent (siblings between first and last seen). Tests in lib/soc-pdf-soc-scan.test.ts (4 new). Full suite 323 pass.
