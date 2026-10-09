# 04: Spike: stable prompt prefix for cross-run cache hits

**Question:** Can two back-to-back Runner runs share a prompt cache, so that the second run reads the system prompt and skill docs from cache instead of writing them again? Today each run writes ~27k system-prompt tokens + ~27k skill-doc tokens to cache (≈ 68k units ≈ 22% of a live ๕.๕ run).

**Blocked by:** –

**Status:** ready-for-agent

## What to try (throwaway, no prod change)

- Fixed work-dir path (today it is `SOCRunner/work/<request id>`, which may change the prefix), skill docs inlined at the start of the prompt, item details last.
- Two `claude -p` runs within the cache TTL with the Runner's flags; compare `cache_read` vs `cache_creation` on the second run's first turns (`../soc-evidence-packet/fixtures/11-slim/cost_breakdown.py`).

## Done when

- [ ] Measured: units saved on the 2nd run, or why the prefix doesn't match (what changes between runs).
- [ ] Recommendation: build it as a Runner change (needs `RUNNER_VERSION` bump + reviewers re-paste the install command) or drop it. The decision goes to the user.

## Comments
