# 05: Cancel or delete a job that is reading or queued

**What to build:** Cancel or delete of a reading or queued scanned job stops Typhoon calls at once. Cancel keeps the cells already read, so the read can resume later. Deleting the job for good, including the existing trash auto-purge, removes the saved cells from disk so bid data does not stay behind. A queued job that is cancelled leaves the queue and later positions move up. See spec and ADR 0010.

**Blocked by:** 04

**Status:** done (2026-10-16)

- [x] Cancel while reading: no further cell reader calls after the cancel returns; saved cells are kept; the job can resume
- [x] Cancel or delete a queued job: it leaves the queue and positions update
- [x] Permanent delete and trash purge remove the saved cells
- [x] Delete of a reading job does not leave a background loop running
- [x] Tests use the fake cell reader and count calls after cancel

## Comments

- 2026-10-16: Done. lib/soc.ts stopScanRead (no new cell after it returns; a queued job leaves the line) and cancelScanRead (job becomes READ_FAILED "ยกเลิกการอ่านแล้ว", cells kept; resume button is ticket 06). Trash (actions/soc.ts) and deleteTrashedSocJob (so also the 30-day purge) stop the read first; the purge already removes the job folder with cells.jsonl. Action cancelSocRead + button "ยกเลิกการอ่าน" on the reading job page. 3 tests added.
