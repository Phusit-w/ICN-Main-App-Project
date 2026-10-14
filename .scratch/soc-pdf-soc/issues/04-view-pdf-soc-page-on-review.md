# 04: "ดูหน้า PDF SOC" on the review page

**What to build:** On the review page of a PDF SOC job, each row has a "ดูหน้า PDF SOC" button. It shows the page of the original PDF the row came from inside the review page, the same way evidence pages are shown, so the reviewer can confirm the table was read right. See `.scratch/soc-pdf-soc/spec.md` (Storage, Review page).

**Blocked by:** 01

**Status:** done

- [x] An additive migration adds a nullable field on the job holding the PDF page of each SOC row. Existing jobs are untouched. (ticket 01)
- [x] The converter records each row's page and job creation stores it. A row cut across a page break gets the page of its own part. (ticket 01)
- [x] The page is rendered with the existing page renderer through an authorised route. Only someone who may open the job can see it.
- [x] The button appears only when the job has a source PDF and the row has a page. Word and Excel jobs look as before.
- [x] Tests cover: stored pages match the rows for a two-page PDF; the route refuses a user without access; jobs without a source PDF show no button.
- [x] Lint, typecheck and build pass. The flow is checked in the browser on a dev job.

## Comments

2026-10-14 (done, committed, not pushed):
- Route: `GET /api/soc/jobs/[id]/soc-rows/[row]/pdf-page?item=<item>`, beside the Image Row route and behind `authorizeSocJob`. It answers 404 when the job has no `SOC_SOURCE_PDF` or no page for the row. The PNG code of the evidence page route moved into `pdfPageResponse` in `lib/soc-pdf-page.ts`, and both routes use it. The evidence route's behaviour is unchanged.
- Row → page: `socRowPage` in `lib/soc-import.ts` finds the row the same way its TOR text is found. The new `SocTable.rowPosition` uses `findRow`, so a results row number that is off but has a unique item still gets the right page (code review finding). It then reads `socRowPages[position - 1]`.
- Review page: `SocReviewRow.socPdfPage` is set when the job keeps its source PDF. The inspector shows "ดูหน้า PDF SOC (หน้า N)" under the TOR text. It opens the page inline (click for full size) with the server's Thai reason on failure. It sits under the TOR text, not in the evidence pane, so it stays beside the row being compared and the cited evidence page stays in view.
- Browser check (dev server on port 3100, pilot-db, with ticket 01's migration applied locally): job "TEST ticket 04 PDF SOC page (Surat)", made from `C:\Phusit\socpdf\surat.pdf` with placeholder results for ข้อ ๑.๑ (14 rows). Row ๑.๑ showed page 1 and row ๑.๑.๓ showed page 2, which starts with ๑.๑.๓. Both are right. The job is still in pilot-db; its results are placeholders.
