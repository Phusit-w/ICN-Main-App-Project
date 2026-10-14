# 04: "ดูหน้า PDF SOC" on the review page

**What to build:** On the review page of a PDF SOC job, each row has a "ดูหน้า PDF SOC" button. It shows the page of the original PDF the row came from inside the review page, the same way evidence pages are shown, so the reviewer can confirm the table was read right. See `.scratch/soc-pdf-soc/spec.md` (Storage, Review page).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] An additive migration adds a nullable field on the job holding the PDF page of each SOC row. Existing jobs are untouched.
- [ ] The converter records each row's page and job creation stores it. A row cut across a page break gets the page of its own part.
- [ ] The page is rendered with the existing page renderer through an authorised route. Only someone who may open the job can see it.
- [ ] The button appears only when the job has a source PDF and the row has a page. Word and Excel jobs look as before.
- [ ] Tests cover: stored pages match the rows for a two-page PDF; the route refuses a user without access; jobs without a source PDF show no button.
- [ ] Lint, typecheck and build pass. The flow is checked in the browser on a dev job.

## Comments
