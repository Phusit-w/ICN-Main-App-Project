# 12: Check finished items while the read is still running

**What to build:** Today the check buttons of a scanned job stay off until the whole file is read (ticket 03). Let a major item be checked as soon as all of its rows are read, while the later pages are still reading, so a reviewer starts working within minutes. The whole file still finishes in about 62 minutes. See spec (user story 6a) and the ADR 0010 amendment.

**Blocked by:** 03 (done). Better after the live run (10) has shown how the job behaves, but not required.

**Status:** needs-triage

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
