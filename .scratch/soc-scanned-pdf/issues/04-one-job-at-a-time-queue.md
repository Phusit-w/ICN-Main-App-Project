# 04: Scanned jobs are read one at a time (queue)

**What to build:** Only one scanned job is read at a time, in upload order, because the Typhoon limit is shared and parallel jobs would not be faster. A job that has not started shows "รอคิวที่ N". When a job finishes (or fails or is cancelled) the next one starts by itself, also after a restart. See spec and ADR 0010.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Two scanned uploads: the first reads, the second shows "รอคิวที่ 1" and starts when the first ends
- [ ] Queue order follows upload order; positions update as jobs leave the queue
- [ ] After a simulated restart the queue continues in the same order
- [ ] A failed or cancelled job does not block the queue
- [ ] Tests use the fake cell reader and assert at most one job reads at any time
