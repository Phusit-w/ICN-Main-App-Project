# 05: Spike: cap Claude's thinking on Runner runs

**Question:** Thinking is now the largest output item: 10.4k of 26.7k output tokens on ๕.๕ (39%) and 24.5k of 51.1k on ๕.๘ (48%) in the 03 gate runs. Output is weighted 5× in the meter. Can the Runner cap thinking (e.g. `MAX_THINKING_TOKENS` env, or an effort setting for `claude -p`, whichever the installed Claude Code supports) without losing quality on the gate keys?

**Blocked by:** –

**Status:** ready-for-agent

## What to try (throwaway, no prod change)

- Check which knob the installed `claude` honours in `-p` mode, and how thinking shows in the session log / `result` event (`output_tokens_details.thinking_tokens`).
- `../fixtures/03-gate/run_gate.py` with the knob set in the child env: ๕.๕ original first (cheaper, 02 key), then ๕.๘ R1 only if ๕.๕ holds. Quota read by the user before/after each.
- Compare with the 03 gate runs: ๕.๕ 26,662 output / 340k units / 8 pts; ๕.๘ 51,140 / 813k / 12 pts.

## Done when

- [ ] Measured: thinking and total output per run with the cap, and the key score.
- [ ] Recommendation: build it as a Runner change (`RUNNER_VERSION` bump + reviewers re-paste the install command) or drop it. The decision goes to the user.

## Comments
