# 04: Scanned jobs are read one at a time (queue)

**What to build:** Only one scanned job is read at a time, in upload order, because the Typhoon limit is shared and parallel jobs would not be faster. A job that has not started shows "รอคิวที่ N". When a job finishes (or fails or is cancelled) the next one starts by itself, also after a restart. See spec and ADR 0010.

**Blocked by:** 03

**Status:** done (2026-10-16)

- [x] Two scanned uploads: the first reads, the second shows "รอคิวที่ 1" and starts when the first ends
- [x] Queue order follows upload order; positions update as jobs leave the queue
- [x] After a simulated restart the queue continues in the same order
- [x] A failed or cancelled job does not block the queue
- [x] Tests use the fake cell reader and assert at most one job reads at any time

## Comments

- 2026-10-16: Done. lib/soc.ts keeps an order list (running job first) beside the promise chain; waiting jobs get stage "รอคิวที่ N", relabelled when a job starts or ends. A failed, cancelled or trashed job leaves the list, so it never blocks. After a restart resumeScanReads starts READING jobs by createdAt, so order holds. Two tests added to test/soc-scan-read.test.ts. No UI change: the stage text shows the label.
