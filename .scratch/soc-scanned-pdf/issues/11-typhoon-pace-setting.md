# 11: Typhoon pace is a setting (default 30 per minute)

**What to build:** The Typhoon cell reader (ticket 02) caps calls at a fixed 20 per 60 seconds. Measured on 2026-10-16, Typhoon accepts about 32 cells per minute with no failures, and parallel calls do not go faster. Make the cap a setting (environment variable, default 30 per minute) so a full USO read takes about 62 minutes instead of about 99. Keep the existing retry with backoff on a rate-limit answer; if Typhoon starts enforcing 20 the read only slows down. See spec and the ADR 0010 amendment.

**Blocked by:** None (02 is done)

**Status:** done (2026-10-16, not committed)

- [ ] The pace comes from one setting, default 30 calls per minute, read in one place; a value of 20 gives the old behaviour
- [ ] Never more than the configured number of calls in any 60-second window, across concurrent callers in the process (the existing window test still passes with the new default and with 20)
- [ ] A rate-limit answer is still retried with a delay and does not fail the cell
- [ ] An invalid or missing value falls back to the default without a network call or crash
- [x] Spec, ticket 02 comment and ticket 10 time expectation say about 62 minutes at the default

## Comments

- 2026-10-16: Done. `lib/soc-typhoon.ts`: `createTyphoonReader({ callsPerMinute })` (default `DEFAULT_CALLS_PER_MINUTE` = 30), `parseCallsPerMinute()` (whole number 1-120 else 30), the server reader reads `TYPHOON_CALLS_PER_MINUTE` from the environment on each call and rebuilds when key or pace changes. Setting is optional; nothing to add to `.env` on the server unless the pace must be lowered (set 20 to get the old behaviour). 9 reader tests pass (2 new), eslint and `tsc --noEmit` clean. The DB-backed scan tests (`test/soc-scan-read.test.ts`) were not run (they use a fake reader and do not touch the pace).
