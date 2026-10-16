# 12: Check finished items while the read is still running

**What to build:** Today the check buttons of a scanned job stay off until the whole file is read (ticket 03). Let a major item be checked as soon as all of its rows are read, while the later pages are still reading, so a reviewer starts working within minutes. The whole file still finishes in about 62 minutes. See spec (user story 6a) and the ADR 0010 amendment.

**Blocked by:** 03 (done). Better after the live run (10) has shown how the job behaves, but not required.

**Status:** code done 2026-10-16 (not committed; live check on USO is part of ticket 10)

Decided with the user 2026-10-16 ("ตามแนะนำ" to all three): (1) an item is ready when the next item has started, i.e. every major item but the last of the pages read so far; (2) the job stays READING, each item has its own state, no new status and no migration; (3) a cancel or failure keeps the items and results already made, and อ่านต่อ goes on from the saved cells.

Open points to settle before building (grill briefly with the user, or read the code first):

- An item's last rows may sit on the next page, which is not read yet; an item is ready only when the next item's first row (or the end of the file) has been seen, or the pages after it are read.
- Major items are made at the end of the read today; they must be made incrementally, without changing the numbering or the result when the read finishes.
- The Runner, the check requests and the results Excel must treat a ready item of a still-reading job like an item of an Excel SOC; every screen must still treat unread items as having no rows.
- Cancel, delete, resume and "อ่านตารางไม่สำเร็จ" keep working; a check already started on a ready item is not lost when the job is cancelled.

- [ ] A major item whose rows are all read can be checked while the job is still reading; an item still being read cannot
- [ ] When the read finishes the major items and their numbering are the same as if the file had been read before any check
- [ ] A check result on an early item survives the rest of the read, a cancel, and a resume
- [ ] The job list and review page show which items are ready and the read progress
- [ ] Existing Excel SOC, text PDF SOC and Word jobs behave as before (run the SOC suite)

## Comments

- 2026-10-16: Code done. How it works: while a scanned PDF is read, every 5 pages the converter offers the rows so far (convertPdfSoc onPartial, lib/soc-pdf-soc.ts; item numbers filled in on copies, the rows are the beginning of the final sheet with the same row numbers). lib/soc.ts publishReadSoFar() reads that sheet's major items, makes every one but the last (SocMajorItem), and stores the sheet as the job's SOC document (the same SocDocument row is updated, so the runner always finds one SOC; the replaced file is deleted when the read ends). finishScanRead keeps those items (same ids, same state and results), brings their numbers up to date only if the full read disagrees (warning when already checked) and makes the rest. A SOC with a ผนวก heading among the rows so far waits for the full read (its items depend on all rows). decideSocRow now also works on READING and READ_FAILED jobs; ตรวจทั้งชุด is refused and hidden while the read is not finished. The job page shows the progress bar and the items already read together. Tests: lib/soc-pdf-soc-scan.test.ts (3 new: partial rows are a prefix of the final sheet, annex flag, onPartial error) and test/soc-scan-read.test.ts (1 new: items made at page 5, one checked, kept after the end, one SOC document, rows-so-far file removed). Not verified: a real USO run (ticket 10); the partial sheet costs one ExcelJS write per 5 pages, which was not timed on 85 pages.
