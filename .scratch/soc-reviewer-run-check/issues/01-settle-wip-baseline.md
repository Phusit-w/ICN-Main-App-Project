# 01: Settle the WIP baseline for SOC work

**What to build:** The repo is on `codex-wip/admin-soc-2026-08-28` with many uncommitted SOC changes (worker, actions, UI, compose, benchmark, rule_semantic) plus untracked SOC ADRs/glossary, including ADR 0008 and the glossary edits from this spec. Decide with the user which of that WIP this effort builds on, commit or park the rest by explicit path (never `git add -A`), and start a clean branch for this feature. After this ticket, every later ticket starts from a known, committed baseline.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The user has decided, file group by file group, what is kept, committed, or parked
- [x] ADR 0008, `docs/SOC-DOMAIN-GLOSSARY.md`, `CONTEXT-MAP.md` and this `.scratch/soc-reviewer-run-check/` folder are committed
- [x] A feature branch for this effort exists, with a clean working tree for SOC files
- [x] `npm run lint` and `npm run typecheck` pass on the baseline (or existing failures are listed in Comments)

## Comments

**2026-10-06 (done).** The feature branch is `feature/soc-reviewer-run-check`. It starts from `origin/main` 7273cb9, which is what prod runs. Despite its name, `codex-wip/admin-soc-2026-08-28` was just origin/main plus uncommitted changes. The local `main` ref is stale (4935afd) and was not touched.

The user decided each group:
- **A, committed (6ac73f9):** ADR 0008, `docs/SOC-DOMAIN-GLOSSARY.md`, CONTEXT-MAP, this `.scratch` folder, ADR 0001/0002, ADR-SOC-AUTO-PASS-POLICY, ADR-SOC-HUMAN-REVIEW-AND-OCR, ADR-SOC-SEMANTIC-REVIEW (now marked superseded by 0008), SOC-ACCURACY-ACCEPTANCE.md.
- **B, committed (a71bb9e):** removed the "ยืนยันผลเดิมทั้งหมด" button and `acceptAllSocResults` (story 32). Only that part of `SocJobDetail.tsx` went in; the semantic display was parked.
- **C, parked on branch `parked/soc-server-worker-2026-10-06` (bbd9279):** OCR/Tesseract, rule_semantic, benchmark + gold labels, schemas, worker.py/test_worker.py, Dockerfile.worker, docker-compose, .env examples, the semantic display in page.tsx/SocJobDetail/soc-shared, and SOC-COMPLIANCE.md. Those files on `feature/soc-gold-expansion` / `feature/soc-semantic-review` differ from the parked copies, so the parked branch is the only copy of this WIP.

Baseline on a71bb9e, all passing: `npm run lint`, `npm run typecheck`, `npm test` (5/5), `npm run soc:test` (5/5) and `npm run build`. A raw backup of the WIP is in this session's scratchpad (`wip-backup-01`), which is temporary.

The harness from ticket 03 (42933e8, 786c797) is already in this branch's history, so nothing needs cherry-picking. `SOC-COMPLIANCE.md` on this branch is the pre-WIP version, so it can now link to `docs/SOC-TESTING.md`.

