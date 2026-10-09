# 02: Compact Results: expand script + skill rules

**What to build:** In the packet flow, Claude writes Compact Results (judgements and explanations only). A new skill script expands them into the full results.json from `job.json`, before the existing validator and append step. Rules and wording: `../spec.md` decisions 3–6.

**Blocked by:** – (can start before 01; 03 measures)

**Status:** done

## What to change

1. **Expand script** (e.g. `scripts/expand_results.py compact.json packet/job.json -o results.json`). Fills `row`/`item`, `reference`, `declared_status` + `declared_status_check` from `tick_signals`, `reference_file` when the row has exactly one candidate file, the n/a fields of heading rows, `tor_claim_results: []`, and the standard wording for pass rows (spec decision 5). Anything Claude wrote wins over a default; a field the script can't fill and Claude left out is an error naming the row (no silent defaults for judgements).
2. **Compact schema** in SKILL.md's results.json section (packet flow only): what Claude must write per row, for pass rows, rows near the line (`partial_visible`, multi-candidate file pick, `better`), and problem rows (all fields, no text repeated across fields).
3. **`tor_decision_basis` rule:** one line per condition, `เงื่อนไข: ค่าใน DS (หน้า X) → ผล`; a row whose offer copies the TOR still quotes the datasheet value. Make sure rule 8 and `compare_tor_values.py` usage still read correctly without `tor_claim_results`.
4. **`append_results_to_docx.py validate()`** and `validate_audit_consistency.py`: accept `tor_claim_results: []`; check nothing else relied on it.
5. **HEADLESS.md** (`lib/soc-skill-headless.ts`, repo): add the expand step to the packet-flow commands if SKILL.md alone isn't enough; update `test/soc-skill-package.test.ts` and `docs/SOC-SKILL-HOSTING.md`. No Runner change, no `RUNNER_VERSION` bump.
6. Old flow and interactive use: unchanged (full results.json).

## Acceptance

- [x] Script tests: pass row, heading row, `partial_visible`, multi-candidate pick, `better`, problem row, Claude-written field overrides a default, missing judgement → error.
- [x] Expanding a compact version of `../soc-evidence-packet/fixtures/11-slim/live-55/results.json` gives the same verdicts on every row, and the validator reports 0 issues.
- [x] The web import accepts the expanded file (`tor_claim_results: []`) without a server change: confirm in `lib/soc-import.ts` / a test.
- [x] Skill suite passes; repo `npm test`, typecheck, lint if HEADLESS changed.
- [x] Package built as `tor-word-compliance-check-<date>-compact.skill` (not uploaded; 03 uploads).

## Comments

2026-10-09 (agent): **paused mid-ticket (user asked to stop).** Skill backup: session scratchpad `skill-backup-2026-10-09-compact`.
- Done (skill, outside git): `scripts/expand_results.py` (+ `tests/test_expand_results.py`, 21 tests; skill suite 105/105). Pass = reference `match`, label `match`/n/a, highlight `complete`/`partial_visible`/n/a, `fully_supported`, `compliant`/`better`/n/a (n/a added for heading rows). Standard wording per spec; `better` → `detail` "ดีกว่า", `key_issue` = basis. Guard: `compliant`/`better`/`non_compliant`/`mixed` basis must contain "หน้า" and "→". Packet owns `item`/`reference`. `declared_status*` filled only when the SOC has no tick boxes. `reference_file` required only with candidates **and** cited pages (folder-only heading row 89 has none). Several candidate files: script states the pick when the facts show it (sub-folder number = row's sub-item, or only that file carries the row's labels), else Claude must write `reference_detail` (every ๕.๕ row has 2 candidates: TC22 + RFD40). `--rows 93,95` for the Runner's picked-row re-check (prompt says results hold only those rows). Adds `evidence_packet` to options.
- SKILL.md: new "Compact Results" subsection + step 7 + mode line (15.2k → 16.8k chars); `tor-decision.md` rule 2 (basis format, `tor_claim_results` old flow only); `evidence-packet.md` P6 + intro.
- Fixture check (live ๕.๕ R1, packet rebuilt at `C:/Phusit/s12`, script `compact_check.py` in session scratchpad): 0 verdict diffs on 25 rows, compact 57% fewer chars than full (34.1k → 14.6k), validator 0 issues, append OK. **All 22 decided rows' live bases failed the guard** ("ตรงค่า TOR", "ค่าเท่าเกณฑ์ → compliant"…), so the new basis rule will lengthen bases: 03 measures the net.
- Web: added test "a packet run whose rows have empty tor_claim_results … is accepted" in `test/soc-import-check-run.test.ts` (NOT run yet); typecheck OK. HEADLESS.md: no change needed (SKILL.md carries the step; runner reads only `out/results.json` + SOC_Check).
- Blocker: `prisma dev` test-db3 now also hangs at "Starting"; tried a fresh `test-db4 -P 51258 --shadow-db-port 51259 -p 51257`, stopped when pausing.

**RESUME:** (1) get a test DB up (try test-db4 above, foreground-in-background; or ask user), run `TEST_DATABASE_URL=… node --test` on `test/soc-import-check-run.test.ts`, then `npm test`, lint; (2) build package `SOC model compliance/Skill/tor-word-compliance-check-<date>-compact.skill`; (3) /code-review; (4) commit only the web test (+ scratch docs) — never `git add -A`; delete `C:/Phusit/s12` when done.

2026-10-09 (agent, resumed): **done.** test-db4 (TCP 51258) works: `test/soc-import-check-run.test.ts` 55/55, `npm test` 204/204, typecheck + lint clean; skill suite 105/105. Package `SOC model compliance/Skill/tor-word-compliance-check-2026-10-09-compact.skill` built (18 files, not uploaded; 03 uploads).
/code-review: no hard violations, no bugs. Left on purpose (open for 03 or a later ticket):
- Heading rows: script fills `highlight_evidence`/`tor_decision_basis`, but `item_label_check`/`highlight_check`/`tor_decision` stay Claude's (rule 10 makes them n/a only when the offer copies the TOR: a judgement, so no silent default).
- `declared_status*` filled only when the SOC has no tick boxes (reading a box is a judgement).
- `verified_value`/`tor_threshold` default to `-` even on threshold rows; the basis guard (needs "หน้า" + "→") is the check. If 03 shows Claude dropping them, require them when `tor_decision` is `better`/`non_compliant`.
- `better` rows copy the basis into `key_issue` (repeats text; spec only asked for the basis).
- tor-decision.md rule 2's basis format applies in every flow, not only the packet flow.
- Style nits vs sibling scripts (`main() -> int`, `indent=1`, period mismatch in `pick_reason` texts).
