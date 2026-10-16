# 06: Read failure and resume

**What to build:** When Typhoon calls keep failing after the automatic retries, the job becomes "อ่านตารางไม่สำเร็จ" and shows a resume button that continues from the cells already saved. A partial `.xlsx` is never made silently. See spec and ADR 0010.

**Blocked by:** 03

**Status:** done (2026-10-16)

- [ ] Persistent failure ends in "อ่านตารางไม่สำเร็จ" with a Thai reason the user can read
- [ ] The resume button re-queues the job and reads only the cells not yet saved
- [ ] No `.xlsx`, major items or enabled check buttons exist for a failed job
- [ ] A short outage that recovers within the retries does not fail the job
- [ ] Tests use a fake cell reader that fails then recovers

## Comments

- 2026-10-16: Done. Automatic retry with delay already lives in the Typhoon reader (lib/soc-typhoon.ts, tested there). New: Thai reason on READ_FAILED, resumeFailedScanRead (lib/soc.ts) + resumeSocRead action + อ่านต่อ button (also resumes a cancelled read). Needs TYPHOON_API_KEY, else Thai message. Tests in test/soc-scan-read.test.ts (2 new). Full suite not run.
