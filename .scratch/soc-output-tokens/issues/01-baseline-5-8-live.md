# 01: Baseline: ๕.๘ live on the slim skill

**What to do:** Run one ๕.๘ check (MOF_RFID, R1 SOC) on the SOC Runner with the current skill package (`2026-10-09-slim`), alone in the queue. The user reads quota before and after. The agent reads the Runner session log (`~/.claude/projects/*SOCRunner-work-<request>/`) with `../soc-evidence-packet/fixtures/11-slim/cost_breakdown.py` and records turns, cache read, cache write, **output tokens**, units, time, and the character size of the results builder `Write`.

Why: ticket 03's size target is measured against this. Earlier ๕.๘ numbers are v2 live (17 pts, old skill) and `claude -p` (9 pts, output under-reported in `-p` stream logs), so neither works as a baseline.

**Blocked by:** –

**Status:** ready-for-human

## Acceptance

- [ ] Quota before/after recorded (user).
- [ ] Turns, cache read/write, output tokens, units, time, results-builder size recorded here.
- [ ] Results still match the ๕.๘ R1 key (171→p.43, 172→p.47/54, 177→p.34/37, 190→p.5, 193 no AMS licence doc); differences noted, not fixed.
- [ ] Field share of results.json characters for ๕.๘ (as in 11's breakdown).

## Comments
