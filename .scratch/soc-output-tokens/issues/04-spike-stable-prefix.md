# 04: Spike: stable prompt prefix for cross-run cache hits

**Question:** Can two back-to-back Runner runs share a prompt cache, so that the second run reads the system prompt and skill docs from cache instead of writing them again? Today each run writes ~27k system-prompt tokens + ~27k skill-doc tokens to cache (≈ 68k units ≈ 22% of a live ๕.๕ run).

**Blocked by:** –

**Status:** done (decision with the user)

## What to try (throwaway, no prod change)

- Fixed work-dir path (today it is `SOCRunner/work/<request id>`, which may change the prefix), skill docs inlined at the start of the prompt, item details last.
- Two `claude -p` runs within the cache TTL with the Runner's flags; compare `cache_read` vs `cache_creation` on the second run's first turns (`../soc-evidence-packet/fixtures/11-slim/cost_breakdown.py`).

## Done when

- [x] Measured: units saved on the 2nd run, or why the prefix doesn't match (what changes between runs).
- [x] Recommendation: build it as a Runner change (needs `RUNNER_VERSION` bump + reviewers re-paste the install command) or drop it. The decision goes to the user.

## Comments

2026-10-09 (agent): **spike done, no prod change.** Probe: `../fixtures/04-spike/probe.py` (one `claude -p --max-turns 1` with the Runner's flags, Sonnet, slim skill in `.claude/skills/`, Claude Code 2.1.295). Cache TTL is **1 hour** (`ephemeral_1h`), so back-to-back items on one PC are well inside it.

| run | work dir | prompt | skill docs | cache read | cache write |
|---|---|---|---|---|---|
| E1 | X1 | A | read by tools | 12,358 | 23,259 |
| E2 | X1 | A (same) | – | 35,617 | **0** |
| E3 | X1 | B (other item) | – | 14,088 | 21,529 |
| E4 | X2 | A | – | 12,358 | 23,259 |
| E5 | X1 | A | in system prompt (`--append-system-prompt-file`, SKILL+HEADLESS+evidence-packet+tor-decision) | 0 | 57,116 |
| E6 | X1 | B | in system prompt | **35,588** | 21,528 |
| E7 | X3 | B | in system prompt | 12,367 | 44,749 |

**What breaks the prefix today (why the 2nd run gets no cache):**
1. **Work dir path** (`SOCRunner/work/<request id>`): it is in the system prompt's environment section, so a new path loses everything after Claude Code's shared static part (~12–14k, already read from cache on every run, also in live logs). E4, E7.
2. **The prompt itself**: item label, file names and scope sit in the first user message, which also carries Claude Code's reminders (skill list etc.), so a different item rewrites that whole message (~21.5k here, ~13k in the live run). E3, E6.
3. **Skill docs read with tools**: a tool result comes after Claude's first reply, whose text and tool ids differ every run, so docs read by `Read` can never be shared across runs. Only the system prompt and the first user message can be.

**Live ๕.๕ slim (302k units, cache write 95k tokens):** turn 1 writes 13.4k (env + prompt), turn 2 14.3k (SKILL.md + HEADLESS.md), turn 3 8.4k (evidence-packet.md + tor-decision.md + job.md). So ~35k tokens of every packet run's cache write is the same text each time.

**Options (Runner change, `RUNNER_VERSION` bump, reviewers re-paste the install command):**
- **A. Fixed work dir + skill docs in the system prompt** (`--append-system-prompt-file` built from the packet-flow docs; HEADLESS says "already loaded, don't Read"). Saves ≈ docs ~21.5k + env ~1.7k → ≈ **27k units per follow-up run (~9% of a ๕.๕ run)**. Measured: E6.
- **B. A + identical prompt** (item details moved to a file, e.g. `out/request.md`, that Claude reads first). The whole first turn is shared: ≈ 35k tokens → ≈ **40k units (~13%)**. Mechanism measured by E2; the combination not run end-to-end.
- **C. Drop it.**

**Caveats:** saves only on the 2nd+ item a PC runs within 1 h of the last one (a queue of one SOC's items: yes; a lone item: no; first run of each day pays the write since the date is in the system prompt). Same skill version and same flow needed (old-flow runs load other docs). A fixed dir means the Runner moves the request folder into `work/current` for the run and back out on pause, and resumes need the same path (Claude stores sessions per cwd). Docs in the system prompt always load all four packet docs (ticket 11's "read only what's needed" stays true for the packet flow: these are the four it reads anyway). The live first turn is smaller than the probe's (27k vs 36k) so the probe's numbers are an upper bound on the env/prompt part; the docs part (~21.5k) is the same files.

**Recommendation:** B if the user often queues several items of one SOC on a PC, since it saves more than any other single change left except Compact Results, and needs no skill rule change. Wait for 03's numbers first so the two savings are measured separately. **Decision: the user's.**
