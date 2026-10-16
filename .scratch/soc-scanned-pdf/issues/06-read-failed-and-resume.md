# 06: Read failure and resume

**What to build:** When Typhoon calls keep failing after the automatic retries, the job becomes "อ่านตารางไม่สำเร็จ" and shows a resume button that continues from the cells already saved. A partial `.xlsx` is never made silently. See spec and ADR 0010.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Persistent failure ends in "อ่านตารางไม่สำเร็จ" with a Thai reason the user can read
- [ ] The resume button re-queues the job and reads only the cells not yet saved
- [ ] No `.xlsx`, major items or enabled check buttons exist for a failed job
- [ ] A short outage that recovers within the retries does not fail the job
- [ ] Tests use a fake cell reader that fails then recovers
