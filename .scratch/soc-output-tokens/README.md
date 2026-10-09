# SOC output tokens: progress board and how to resume

> **เริ่ม session ใหม่ทุกครั้ง อ่านไฟล์นี้ก่อน**

The spec and the grill decisions (2026-10-09) are in `spec.md`. Background: `../soc-evidence-packet/issues/11-shrink-skill-docs.md` (last section, "where the quota still goes"). Work on branch `feature/soc-reviewer-run-check` unless a new branch is agreed.

## How to continue

1. Say **`/implement .scratch/soc-output-tokens/issues/<NN>-....md`**. Pick the first `ready-for-agent` ticket whose blockers are all `done`.
2. At the end of every session: update the ticket's `Status:` and checkboxes, add a dated note under `## Comments`, and update this board.
3. The skill is outside git: `ICN Apps/SOC model compliance/Skill/tor-word-compliance-check/tor-word-compliance-check/`. Back up the folder before editing. Quota readings need the user (this chat shares the account).

## Board

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | Baseline: ๕.๘ live on the slim skill | – | wontfix 2026-10-09 (skipped; 03 used v2 live) |
| 02 | Compact Results: expand script + skill rules | – | done 2026-10-09 (pkg `-compact` built, not uploaded) |
| 03 | Gate + upload | 01, 02 | gates done 2026-10-09: quality kept, size −6%/−5% (targets missed), user kept compact; done 2026-10-09: pkg `2026-10-09-compact3` CURRENT on prod |
| 04 | Spike: stable prompt prefix for cross-run cache hits | – | done 2026-10-09: measured, options A/B/C, decision with the user |
| 05 | Spike: cap Claude's thinking on Runner runs | – | done 2026-10-09: `MAX_THINKING_TOKENS` ignored, runs already `--effort medium`; `low` on ๕.๕ = key pass but thinking −3% / units −3% → user chose drop 2026-10-09 |
| 06 | Runner: shared prompt prefix (04 option B) | – | ready-for-agent |

## Deferred

- Haiku per item: only behind a gate against the keys.
- Shorter `job.md`.
