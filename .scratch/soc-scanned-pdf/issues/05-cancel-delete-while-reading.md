# 05: Cancel or delete a job that is reading or queued

**What to build:** Cancel or delete of a reading or queued scanned job stops Typhoon calls at once. Cancel keeps the cells already read, so the read can resume later. Deleting the job for good, including the existing trash auto-purge, removes the saved cells from disk so bid data does not stay behind. A queued job that is cancelled leaves the queue and later positions move up. See spec and ADR 0010.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Cancel while reading: no further cell reader calls after the cancel returns; saved cells are kept; the job can resume
- [ ] Cancel or delete a queued job: it leaves the queue and positions update
- [ ] Permanent delete and trash purge remove the saved cells
- [ ] Delete of a reading job does not leave a background loop running
- [ ] Tests use the fake cell reader and count calls after cancel
