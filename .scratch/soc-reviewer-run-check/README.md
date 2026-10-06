# SOC reviewer-run check: progress board and how to resume

> **เริ่ม session ใหม่ทุกครั้ง อ่านไฟล์นี้ก่อน**

## How to continue in a new session

1. `/clear`, or open a new session in `Main_Project_Build_App`. Work on branch **`feature/soc-reviewer-run-check`**.
2. Say: **`/implement .scratch/soc-reviewer-run-check/issues/<NN>-....md`**. Pick the first ticket on the board
   below that is `ready-for-agent` and whose blockers are all `done`.
3. The agent reads the ticket, `spec.md`, ADR 0008 and `docs/SOC-DOMAIN-GLOSSARY.md`. Everything it needs is
   in those files, so there is no need to retell the history.
4. **At the end of every session**, even if the ticket isn't finished:
   - update the ticket's `Status:` line (`in-progress` / `done`) and tick its checkboxes;
   - add a dated note under `## Comments` in the ticket: what was done, what is left, commit hashes, and
     anything the next session must know;
   - update the board below.
5. A `ready-for-human` ticket (01, 02, 07, 16) needs the user to act or decide. Do it together with the agent
   in the session.

## Board

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | Settle the WIP baseline | – | done |
| 02 | Measure accuracy + quota on a real SOC | – | ready-for-human |
| 03 | node:test harness | 01 | done |
| 04 | Imported SOC Check + major items | 01, 03 | done |
| 05 | Import one Local Check Run (seam 1) | 04 | done |
| 06 | Re-check a major item | 05 | done |
| 07 | Prototype the review page | – | ready-for-human |
| 08 | New review page | 05, 07 | ready-for-agent |
| 09 | PDF evidence panel | 08 | ready-for-agent |
| 10 | Download combined SOC_Check | 05 | done |
| 11 | Skill hosting | 01 | done |
| 12 | Runner link + token + heartbeat | 04 | done |
| 13 | Check Requests + runner API (seam 2) | 05, 11, 12 | done |
| 14 | SOC Runner core (seam 3) | 13 | done |
| 15 | Runner special states | 14 | ready-for-agent |
| 16 | Installer (no admin) | 14 + IT answer | ready-for-human |

Phase 1 = 01–10 (useful on its own, with manual upload). Phase 2 = 11–16.

## Running tests

`npm test`, set up per `docs/SOC-TESTING.md` (start the `test-db` server first).

## Open items outside tickets

- Ask IT about AppLocker/WDAC and unsigned installers. This must be answered before ticket 16.
