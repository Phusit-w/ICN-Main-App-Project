# 07: Delete builds 30 days after creation

**What to build:** Purge builds (and their stored files) 30 days after creation, using the same server-start + periodic purge pattern as the SOC trash. SOC Templates in the shared list are not purged.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Test: a 31-day-old build and its files are removed, a 29-day-old one is kept, templates untouched
- [ ] lint, typecheck, tests pass

## Comments
