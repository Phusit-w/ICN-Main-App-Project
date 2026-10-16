# 09: Review page opens the scanned source page

**What to build:** The existing "ดูหน้า PDF SOC" button on the review page also works for a row that came from a scanned page. It shows that page as an image, so the reviewer can compare the read text with the original scan. See spec and ADR 0010.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A row from a scanned page opens its page image from the review page
- [ ] Rows from text pages in a mixed PDF still open as before
- [ ] A user without access to the job cannot fetch the page
- [ ] A test covers the page route for a scanned-page row
