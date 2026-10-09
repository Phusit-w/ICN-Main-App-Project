# 05: Spike: cap Claude's thinking on Runner runs

**Question:** Thinking is now the largest output item: 10.4k of 26.7k output tokens on ๕.๕ (39%) and 24.5k of 51.1k on ๕.๘ (48%) in the 03 gate runs. Output is weighted 5× in the meter. Can the Runner cap thinking (e.g. `MAX_THINKING_TOKENS` env, or an effort setting for `claude -p`, whichever the installed Claude Code supports) without losing quality on the gate keys?

**Blocked by:** –

**Status:** done (2026-10-09: measured, dropped by the user)

## What to try (throwaway, no prod change)

- Check which knob the installed `claude` honours in `-p` mode, and how thinking shows in the session log / `result` event (`output_tokens_details.thinking_tokens`).
- `../fixtures/03-gate/run_gate.py` with the knob set in the child env: ๕.๕ original first (cheaper, 02 key), then ๕.๘ R1 only if ๕.๕ holds. Quota read by the user before/after each.
- Compare with the 03 gate runs: ๕.๕ 26,662 output / 340k units / 8 pts; ๕.๘ 51,140 / 813k / 12 pts.

## Done when

- [x] Measured: thinking and total output per run with the cap, and the key score.
- [x] Recommendation: build it as a Runner change (`RUNNER_VERSION` bump + reviewers re-paste the install command) or drop it. The decision goes to the user.

## Comments

2026-10-09 (agent): **spike done, no prod change. Recommendation: drop.**

**Knob** (Claude Code 2.1.295, one-turn `claude -p` probes, Sonnet, hard counting puzzle, all gave the same answer):

| setting | thinking tokens |
|---|---|
| default (no flag, no env) | 15,569 |
| `--effort low` | 5,782 |
| `--effort high` | 21,089 |
| `MAX_THINKING_TOKENS=1024` | 13,842 (**not a cap**) |
| `MAX_THINKING_TOKENS=0` | 7,524 (**not off**) |

So `MAX_THINKING_TOKENS` is not honoured in `-p` mode; `--effort` is. The session log records it per turn (`"effort":"low"`); the `result` event has `usage.output_tokens_details.thinking_tokens`.

**Every earlier run was already `medium`:** session logs of g55, g58 and the live requests (`cmv0brs6w…`, `cmuzn5dwv…`, `cmv0effdf…`, `cmv0dyutd…`) all say `"effort":"medium"` (Sonnet's default on the Runner; inside a Claude Code shell `CLAUDE_EFFORT=medium` is also inherited). So the only lower step left is `low`.

**Gate: ๕.๕ original SOC, compact3 (= prod), `--effort low`** (`fixtures/05-spike/run_spike.py C:/Phusit/e55low --effort low`, 2.7 min, 9 messages / 19 turns). Quota 81% → 87% = **6 pts** (g55 medium: 8 pts; quota is whole points and this chat shares the account, so treat as noise).
- **Key: all pass**: ref 22 match / 2 mismatch (102 ๒.๑, 109 ๒.๘) / 89 n/a; 95 ๑.๕ `non_compliant` "SOC 7,000 mAh แต่ DS 3800/5200 mAh"; 103 ๒.๒ `non_compliant` "SOC dBm ต่างจาก DS (0-30 dBm EIRP)"; 93 ๑.๓ `partial_visible`; 92 names the ZPL2600054 Zebra Business Letter. 8/8 pages Read, validator 0 issues, compact written once with Write (20.3k chars). Fixture `fixtures/05-spike/e55low/`.
- **Meter: thinking 10,151 vs 10,433 (−3%)**, output 25,307 vs 26,662 (−5%), **units 330k vs 340k (−3%)**. Within run-to-run noise.

**Why low barely moves it here:** on the puzzle low cut thinking by ~60%, but a Runner run is ~9 short agentic turns (read docs, read pages, write compact, expand, validate); thinking per turn is already small and goes into deciding verdicts, which low does not skip. The effort setting mostly trims long deliberation on a single hard step, and the SOC run has none.

**๕.๘ R1 gate not run:** ๕.๕ shows no saving worth a Runner change, and quota was at 87% (๕.๘ costs ~12 pts).

**Recommendation: drop** (no `RUNNER_VERSION` bump, reviewers don't need to re-paste). If ever revisited, the only knob is `--effort low` in `claude_cli.run_arguments`, gated on ๕.๘ R1 first. **Decision: the user's.**

2026-10-09 (user): **drop.** Next: 04 option B → ticket 06.
