# 02: One SOC table reader in the skill (prefactor)

**What to build:** The skill's scripts (table inspection, Evidence Packet builder, results expansion) read SOC rows through one row model, so a later ticket can feed it Excel rows and Image Rows without touching the check rules. A Word SOC is checked exactly as before.

The skill lives outside this repo (`ICN Apps/SOC model compliance/Skill/tor-word-compliance-check/`); nothing is committed here. Do not upload a Skill Package in this ticket.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The packet builder and the other scripts get rows from the one reader; none of them walks the Word XML on its own
- [x] The Evidence Packet built for MOF_RFID ๕.๕ is identical to the one built before the change
- [x] All existing skill tests pass
- [x] SKILL.md and the reference docs a run reads are not longer than before

## Comments

**2026-10-12: done.** Skill code only (outside git, no Skill Package built or uploaded). A copy of the skill before the change is not kept in the repo.

- New `scripts/soc_table.py` is the reader: `read_soc_tables(soc)` gives `SocTable` (index, has_header_row, column_names by grid column, rows) / `SocRow` (table_index, number, cells, `texts`, `text(position)`) / `SocCell` (text, grid column, tick-box signals as short facts, merged_from_row_above). It also holds `cell_signals` and the `inspect_word_table` report.
- `build_evidence_packet.py` no longer imports python-docx: `soc_rows`, `signal_names` and the Word walk in `tick_signals` are gone; `build`, `reference_columns` and `tick_signals` work on the row model. The SOC is now opened once per build instead of three times.
- `inspect_word_table.py` is only the command line; same arguments and output.
- `expand_results.py` reads job.json only, so it needed no change. `append_results_to_docx.py` still opens the Word file, to write the SOC_Check copy (output, not reading rows).
- New `tests/test_soc_table.py` (6 tests, real .docx built in the test). All skill tests pass: 120 (114 before).
- Identical packets: built for MOF_RFID ๕.๕, ๕.๘ and ๕.๑ from a clean copy of the job with the old and the new scripts; all 63 files are byte-identical (job.json compared without `generated_at`). All 355 SOC rows, their tick signals and the inspect report are also identical.
- SKILL.md and references/*.md untouched.
- /code-review done; fixed: tables are filtered before cell signals are read, the builder uses `SocRow` directly, CRLF line endings of `build_evidence_packet.py` restored.

For 04 and 07:

- 04: `read_soc_tables` must pick the reader by file kind (it calls python-docx directly). `table_index`/`number`/`column` map to sheet/row/column. SKILL.md line 39 and check-rules.md line 7 point Claude at `inspect_word_table.py`, which is Word only. The builder's command-line argument is still called `soc_docx`.
- 07: `SocCell` has no image field. A drawing is only counted inside `signals` ("drawing x1"), mixed with tick signals; add a field for "the TOR cell has a drawing and no text" and the image bytes.
- The MEA sample SOC in `Example SOC+TOR+Datasheet` is a `.doc`; it must be saved as `.docx` before any run or comparison.
