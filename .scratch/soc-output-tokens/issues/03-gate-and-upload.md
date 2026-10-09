# 03: Gate + upload

**What to do:** Check that Compact Results keeps quality and cuts output, then upload the package and confirm on a live run. Criteria: `../spec.md` decision 7.

**Blocked by:** 01, 02

**Status:** ready-for-human (user uploads `2026-10-09-compact3`; then done)

## Steps

1. `claude -p` runs with the Runner's flags (`../soc-evidence-packet/fixtures/11-slim/run_runner.py`, pointed at the new package; fixtures under `fixtures/03-gate/`), packet on, quota read by the user before/after each:
   - ๕.๕ on the **original** SOC (not R1).
   - ๕.๘ on R1.
   - ๕.๕ old flow (`SOC_RUNNER_PACKET=0`): still writes full results.json, validator 0 issues.
2. Score against the keys; count output size (results builder `Write` chars) and units.
3. If quality passes: upload the package (user), deploy if HEADLESS changed, then one ๕.๘ live run alone in the queue; compare with 01.

## Acceptance

- [x] ๕.๕ original: 02 key (ref 22 match / 2 mismatch ๒.๑ + ๒.๘ / ๕.๕ n/a), ๑.๕ and ๒.๒ `non_compliant` with the DS value in `tor_decision_basis`, ๑.๓ `partial_visible`, ๑.๒ names the Zebra letter.
- [x] ๕.๘ R1 (177 half: p.34 only, as every earlier run; user accepted): 171→p.43, 172→p.47/54, 177→p.34/37, 190→p.5, 193 no AMS licence doc.
- [x] Every row with a TOR threshold quotes a datasheet value in `tor_decision_basis` (no bare "ตรงตาม TOR").
- [x] Validator 0 issues; import accepted.
- [ ] **Not met** (−6% output / −5% units vs v2 live; no slim baseline from 01): Output tokens −35% or more; ๕.๘ live units −15% or more vs 01. Quota points recorded as a cross-check (accept even if they don't move).
- [x] (no rollback: user kept compact) Any quality miss → roll back to `2026-10-09-slim` and note why.

## Comments

2026-10-09 (agent): **first live ๕.๘ R1 run on `-compact`** (by accident, meant as 01; request `cmv0dyutd0002ecn2hmy9alxd`, 10:08:38–10:14:12, 5.5 min, 50 rows, import accepted). Compact + builder in `../fixtures/03-gate/live-58-compact/`. Quota: before 15%, after 26% → **11 pts** (old v2 ๕.๘ live: 17 pts; `claude -p` slim: 9 pts, not comparable).
- Meter: 19 turns, cache read 2.28M, write 160k, **output 48,970 tokens**, **674k units** (read 34% / write 30% / output 36%). Old v2 ๕.๘ live (17 pts, not slim): 26 turns, output 54,495, 854k units → −21% units, −10% output. Still needs the slim baseline (01) to judge the −35% / −15% targets.
- **Wasted output:** Claude first wrote the 17.3k-char builder as a Bash heredoc, which failed (`unexpected EOF while looking for matching '` — Thai text with a quote), then wrote it again with Write (17.8k). That is ~⅓ of the run's tool-input output. Fix candidate for the skill: "write the compact builder with the Write tool, never a shell heredoc".
- Expand guard worked: first expand listed 7 rows (missing `reference_detail`/`highlight_evidence`/`detail` on problem rows, row 193 basis format); one Edit fixed them; validator 0 issues.
- Compact results 15.6k chars (old full results.json for v2: builder Write 31.7k). Field share: `tor_decision_basis` 34%, `key_issue` 14%, `reference_detail` 12%, `evidence_detail` 7%, `highlight_evidence` 6%. Basis avg 102 chars/row.
- Key: 171→p.43 ✅, 172→p.47/54 ✅, 177 → Claude says p.34 **and 36** (key p.34/37) ⚠️, 190→p.5 ✅, 193 no AMS licence doc ✅. Verdicts: ref 42 match / 7 mismatch / 1 not_found; tor 39 compliant / 8 n/a / 3 unverifiable.
- Claude also read the AMS PDF directly 4× and rendered p.64 to PNG (packet page text wasn't enough for one row): worth checking which row in the gate run.

2026-10-09 (agent): skill rule added to SKILL.md Compact Results: write `out/compact.json` once with the Write tool (plain JSON), no Python builder, no heredoc/`cat <<`/`echo`; fix rows with Edit. Package `tor-word-compliance-check-2026-10-09-compact2.skill` (18 files, sha `06efdab2d349`), served zip + `run_gate.py` in `../fixtures/03-gate/`.

2026-10-09 (agent): **live ๕.๕ on `-compact`** (request `cmv0effdf001necn2jjh2pape`, user-started, SOC `R1_ok (P)`, so the 02 original-SOC key does not apply). Quota 30% → 36% = **6 pts** (live ๕.๕ slim on original: 8). Meter: 9 turns, output **22,725** (slim live 26,559: −14%), **314k units** (slim 302k: +4%, cache write 105k vs 95k). `compact.json` written directly with Write (17.3k chars, vs slim results Write 21.6k), then a 2.5k heredoc `patch_compact.py` to add missing fields (compact2 rule forbids that). Validator 0 issues, import accepted. Verdicts: ref 23 match / 1 mismatch (109: candidate RFD40 p.1) / 1 n/a; tor 21 compliant + 1 better (105) + 3 n/a. Fixture `../fixtures/03-gate/live-55-compact/` (compact after the patch).

2026-10-09 (agent): **gate 1: ๕.๕ original SOC, `claude -p` on compact2** (`C:/Phusit/g55`). Quota 36% → 44% = **8 pts** (same as slim). **Key: all pass**: ref 22 match / 2 mismatch (102 ๒.๑, 109 ๒.๘) / 89 n/a; 95 ๑.๕ `non_compliant` "SOC 7,000 mAh แต่ DS 3800/5200 mAh (หน้า 3)"; 103 ๒.๒ `non_compliant` "SOC 4-34 dBm… แต่ DS 0–30 dBm"; 93 ๑.๓ `partial_visible`; 92 ๑.๒ key_issue names the ZPL2600054 Zebra Business Letter. 8/8 pages Read, validator 0 issues, every threshold row quotes a DS value. Compact written once with Write (20.4k chars) + one Edit (0.6k), no heredoc.
- Meter (session log): 9 turns, **output 26,662** (of which **thinking 10,433**), cache write 109k, **340k units**. vs live ๕.๕ slim original (26,559 / 302k): **no output cut on ๕.๕**. Reasons: ~40% of output is thinking (compact doesn't touch it); ๕.๕ has many problem rows that need every field (compact 20.4k vs slim full results Write 21.6k); heading row 89 (all n/a) was forced to write every field because `expand_results.py` treats `reference_check: not_applicable` as a problem row (fix candidate).
- Meter note: `claude -p` stream-json assistant events carry partial usage (output 969 for this run); the `result` event and the session log have the real figure. `run_gate.py` now meters the session log. Earlier `claude -p` meter numbers taken from `run.jsonl` may be understated.

2026-10-09 (agent): `expand_results.py`: a folder-only heading row (no cited pages) with reference/evidence `not_applicable` now passes and gets "แถวหัวข้อ อ้างโฟลเดอร์ ไม่มีเลขหน้า" (+2 tests, 107 skill tests OK; SKILL.md pass-row line says so). Not in compact2.

2026-10-09 (agent): **gate 2: ๕.๘ R1, `claude -p` on compact2** (`C:/Phusit/g58`, 6.2 min, 25 turns). Quota 44% → 56% = **12 pts** (v2 live 17, compact live 11). Key: 171→p.43 ✅, 172→p.47/54 ✅, 177→p.34 only ⚠️ (says p.36 supports part; misses p.37, same half-answer as every earlier run), 190→p.5 ✅, 193 no AMS licence doc (Zebra/HID letters cover hardware only) ✅. 24/24 pages Read, validator 0 issues. Verdicts: ref 43 match / 6 mismatch / 1 not_found; tor 39 compliant / 6 n/a / 5 unverifiable. Compact written once with Write (24.7k chars), expand flagged 4 rows (3 missing `reference_detail` on multi-file rows, row 193 basis format twice), 5 Edits, no heredoc.
- Meter (session log): **output 51,140, of which thinking 24,472 (48%)**, cache write 170k, **813k units**. vs v2 live (54,495 / 854k): **−6% output, −5% units**. Targets (−35% / −15%) **not met**. The results part did shrink (compact 24.7k chars vs v2 results Write 31.7k), but thinking is now the largest single output item and compact doesn't touch it.
- Claude again searched the AMS PDF with a pymupdf script (keywords ประวัติ / Scan Tag / Asset ID over all pages, text of p.43/47/54/62/63) and rendered p.64 to PNG, i.e. looked outside the cited pages for candidates. `check_page_reads.py` doesn't flag it (it isn't a dump of packet page files).
- `run_runner.measure` crashes on a stream-json event whose `message` is a string (stats.json not written); the session-log meter is unaffected.

2026-10-09 (agent): **decision (user): keep Compact Results** despite the size targets. Quality held on both gate keys; row 177 gives p.34 without p.37, the same half answer as every earlier run (old flow, v2, live compact), so it was not counted as a compact regression. Size was measured against v2 live, not the 01 slim baseline (01 never ran on slim), so the −6%/−5% figures are approximate. **Gate 3 (old flow, `--no-packet`) skipped** by the user's choice: the old flow's docs and scripts were not changed by 02/03. The next output lever is thinking → ticket 05.
- Code review fixes: `folder_only_heading(facts)` + `FOLDER_HEADING_ALSO_PASSES` in `expand_results.py`; the overlay now needs a cited folder (non-empty `reference`) and `tor_decision: not_applicable`, so a heading row with claims or with no reference still writes every field (+2 tests, 109 skill tests OK). spec.md decision 5 notes the widening. `run_gate.py`: session-log folder via `re.sub(r"[^A-Za-z0-9]", "-", …)`, clear error when missing, string `message` events skipped.
- **Package `tor-word-compliance-check-2026-10-09-compact3.skill`** (18 files, sha `dca337fdd1a8`) = compact2 + the heading-row fix. The heading fix itself was not gate-run (unit tests only). HEADLESS.md unchanged → no deploy. **Left for the user:** upload compact3 to replace `-compact` (current on prod).
