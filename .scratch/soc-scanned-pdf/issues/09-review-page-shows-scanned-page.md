# 09: Review page opens the scanned source page

**What to build:** The existing "ดูหน้า PDF SOC" button on the review page also works for a row that came from a scanned page. It shows that page as an image, so the reviewer can compare the read text with the original scan. See spec and ADR 0010.

**Blocked by:** 03

**Status:** done (2026-10-16)

- [x] A row from a scanned page opens its page image from the review page
- [x] Rows from text pages in a mixed PDF still open as before
- [x] A user without access to the job cannot fetch the page
- [x] A test covers the page route for a scanned-page row

## Comments

- 2026-10-16: No code change needed. Ticket 03 already keeps the PDF as SOC_SOURCE_PDF and saves `socRowPages` (page of each row, scan or text) when the read ends, so the ticket-04 route and button work for scanned jobs as they are. Added the route test to `test/soc-scan-read.test.ts` (page 1 vs page 2 differ, unknown row 404, no access 403, signed out 401). Text pages in a mixed PDF use the same `rowPages` and the unchanged text-PDF route test. 12/12 in that file, tsc and eslint clean.
