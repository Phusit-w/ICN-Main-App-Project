# 03: Scanned PDF upload creates a background read job (tracer bullet)

**What to build:** Uploading a scanned PDF SOC creates the job at once in the new status "กำลังอ่านตาราง" with a progress count. The read runs in the background inside the existing web process using the converter (01) and the Typhoon reader (02). Every cell result is saved to disk as soon as it is read, so a restart or deploy resumes from the saved cells without re-reading them. When all cells are done the generated `.xlsx` is written beside the original PDF, the major items are made, and the job becomes an ordinary Excel SOC with check buttons on. While reading, check buttons stay off and every screen that uses rows, major items or exports treats the job as not ready. Needs an additive schema change safe for the production database. See spec and ADR 0010.

**Blocked by:** 01, 02

**Status:** done (2026-10-16)

- [x] Upload of a scanned PDF returns at once; the job shows "กำลังอ่านตาราง" and progress
- [x] Check buttons, major items and exports are unavailable until the read finishes
- [x] Cell results are persisted per cell; a simulated restart resumes without re-reading saved cells
- [x] On completion the job has the same major items as the equivalent Excel SOC and checks are on
- [x] The migration is additive and applies cleanly on a copy of production-shaped data
- [x] Tests use the fake cell reader; existing Word, Excel and text PDF job tests still pass

## Comments

- 2026-10-16: Done, no schema change (status READING/READ_FAILED, stage, progress are existing columns). lib/soc.ts createReadingSocJob/startScanRead/resumeScanReads/finishScanRead, lib/soc-scan-read.ts (cells.jsonl per cell), hasScannedTable + onPage in converter, instrumentation resumes READING jobs. Reads run one at a time (queue state on globalThis). A job trashed while reading stops. Not yet: queue label (04), cancel (05), READ_FAILED resume button (06), upload confirm + no-key message (07). READING jobs stay READING after a restart if TYPHOON_API_KEY is gone. Tests: test/soc-scan-read.test.ts (4).
