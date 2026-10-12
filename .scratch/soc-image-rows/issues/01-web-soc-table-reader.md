# 01: One SOC table reader on the web (prefactor)

**What to build:** Every part of the web that needs the SOC table (upload validation, major-item splitting, the row texts on the review page, the results Excel) gets it from one reader whose interface is "SOC file in; major items, row texts and upload warnings out". Callers stop knowing that the file is a Word document. Nothing a reviewer sees changes: this ticket only makes tickets 03 and 06 easy.

Spec: `../spec.md`, "Seams". Keep the interface small; Excel input, image markers and warnings are added by later tickets, so leave room for them without building them.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Upload, major-item split, review row texts and the results Excel all read the SOC through the one reader; no caller parses the Word file itself
- [x] A Word SOC gives the same major items, row texts and split as before (existing tests unchanged and passing)
- [x] The reader's result has a place for upload warnings and a per-row image marker, both empty for now
- [x] lint, typecheck, `npm test` and build pass

## Comments

**2026-10-12: done.**

- New `lib/soc-table.ts` is the reader. `assertSocFile({ name, bytes })` is the upload check (extension + content); `readSocTable(bytes)` gives `{ file, majorItems, rowText, warnings }`. It reads by content, so a stored SOC is read again whatever its name.
- `file` (`extension`, `mimeType`) is how `createImportedSocJob` stores the SOC without knowing it is Word. `warnings` is `[]`; `SocRowText.image?: true` is the per-row marker, never set yet.
- `lib/soc-major-items.ts` keeps only the rules on rows: item numbers, `majorItemsOfRows(rows)` (tally + 60-row split), `sameItem`, `normalItem`. All Word parsing moved to the reader. `DOCX_MIME` and `magicIsDocx` moved to `lib/soc-shared.ts` (still exported through `lib/soc`).
- Callers: `validateUpload` -> `assertSocFile`; `createImportedSocJob` and `jobSocRowTexts` -> `readSocTable`. The review page and the results Excel use the row texts stored at import (or `jobSocRowTexts`), as before.
- Tests: `lib/soc-major-items.test.ts` keeps every assertion; only its imports changed (two local helpers call `readSocTable`). New `lib/soc-table.test.ts`, and one upload test in `test/soc-imported-job.test.ts` (a non-Word SOC is refused, nothing kept).
- Validation: lint, typecheck, build pass. `npm test`: 215 of 216 pass; the one failure is the filter test in `test/soc-review-workspace.test.ts`, which was already failing before this ticket.
- /code-review done; fixed: the upload check kept in `validateUpload` (same error order as before), no file-name check when re-reading a stored SOC, duplicate helpers removed.

For 03 and 06:

- 03 adds `.xlsx` in `assertSocFile` and `readSocTable` (tell Word from Excel by content: `word/document.xml` vs `xl/workbook.xml`), and must change the upload form (`components/SocUploadForm.tsx` still says DOCX and has `accept=".docx"`) and the two Word-only messages in `lib/soc-table.ts`.
- 06 needs more than the `rowText(row, item)` lookup to count or serve Image Rows (a row list or an image lookup); add it then.
