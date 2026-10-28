# 07: Delete builds 30 days after creation

**What to build:** Purge builds (and their stored files) 30 days after creation, using the same server-start + periodic purge pattern as the SOC trash. SOC Templates in the shared list are not purged.

**Blocked by:** 04

**Status:** done 2026-10-28

- [x] Test: a 31-day-old build and its files are removed, a 29-day-old one is kept, templates untouched
- [x] lint, typecheck, tests pass

## Comments

2026-10-28: purgeExpiredSocBuilds in lib/soc-builds.ts (row + folder, audit SOC_BUILD_DELETED with no actor), run from startSocTrashPurge (first run 1 min after start, then every 6 h). Shared templates untouched. Test in test/soc-builds.test.ts; full suite 487 pass.
