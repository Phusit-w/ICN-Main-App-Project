# 01: Settle the WIP baseline for SOC work

**What to build:** The repo is on `codex-wip/admin-soc-2026-08-28` with many uncommitted SOC changes (worker, actions, UI, compose, benchmark, rule_semantic) plus untracked SOC ADRs/glossary, including ADR 0008 and the glossary edits from this spec. Decide with the user which of that WIP this effort builds on, commit or park the rest by explicit path (never `git add -A`), and start a clean branch for this feature. After this ticket, every later ticket starts from a known, committed baseline.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] The user has decided, file group by file group, what is kept, committed, or parked
- [ ] ADR 0008, `docs/SOC-DOMAIN-GLOSSARY.md`, `CONTEXT-MAP.md` and this `.scratch/soc-reviewer-run-check/` folder are committed
- [ ] A feature branch for this effort exists, with a clean working tree for SOC files
- [ ] `npm run lint` and `npm run typecheck` pass on the baseline (or existing failures are listed in Comments)

## Comments
