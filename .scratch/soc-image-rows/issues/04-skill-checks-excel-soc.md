# 04: The skill checks an Excel SOC

**What to build:** A Local Check Run on one major item of an Excel SOC produces a valid results file by the same rules as a Word SOC, and no SOC_Check copy.

- The skill's SOC reader accepts `.xlsx` with the same sheet, header, row-number and tick rules as the web (ticket 03); the two must number rows identically.
- The Evidence Packet has the same shape as for a Word SOC.
- The step that appends results to a Word copy is skipped for an Excel SOC, and the instructions a run reads say so in one place.

Skill work, outside this repo. Do not upload a Skill Package (ticket 09 does).

**Blocked by:** 02

**Status:** done

- [x] Row numbers and items from the skill's reader match the web reader's for the same workbook (a test in each place uses the same small workbook layout)
- [x] A `claude -p` Sonnet run on one major item of the Surat Thani sample (run from a short work folder) ends with a results file that passes the validator, with every packet page Read
- [x] The run writes no SOC_Check and does not fail for lacking one
- [x] A Word SOC run is unchanged (existing skill tests pass)
- [x] Quota or token use of the run is noted in Comments

## Comments

**2026-10-12 (from the user, during ticket 03):** some SOCs write the reference in the หมายเหตุ column. The web reader takes the หมายเหตุ/Remark column as the reference column when no column is named as one (อ้างอิง, เลขหน้า, ชื่อไฟล์, Reference …). The skill's Excel reader must do the same, since a row with text only in that column counts as a SOC row. For a Word SOC the packet builder already finds the reference column by what the cells say; its header fallback only knows อ้างอิง/Reference, so add หมายเหตุ there too. The exact row and header rules are at the top of `lib/soc-table-excel.ts`.

**2026-10-12, after ticket 03 (replaces the note above where they differ):** the reference column and the หมายเหตุ/Remark column are two separate optional columns in the web reader; text in either makes a SOC row. For the packet, the row's reference should be the reference cell plus the remarks cell. Also owned by this ticket: the declared Comply/Better from the tick columns (the web reader does not give it out), and the 0.00 number-format rule for item numbers typed as numbers. A small workbook layout used by a test on both sides is the safest way to keep row numbers identical; `lib/soc-table-excel.test.ts` has the layouts.

**2026-10-12: done.** Skill code only (outside git, no Skill Package built or uploaded).

- New `scripts/soc_table_excel.py`: a port of `lib/soc-table-excel.ts` (zip + XML, standard library only). `read_soc_tables` in `soc_table.py` tells Word from Excel by the file's content. An Excel SOC gives one `SocTable` per included sheet; `SocRow.number` is the SOC row number, counted on across sheets; a row's cells are always item, TOR, offer, reference, remarks, Comply tick, Better tick. `SocTable.reference_positions` says where the reference is when the reader knows it (Excel); a Word table leaves it empty and the builder finds the cell as before.
- Packet builder: the row's reference is the reference cell then the remarks cell, joined with ` | `. Each cell is read on its own for folders and file names, so the words or numbers of a remark don't hide the file the reference cell names. A non-empty tick cell reaches job.md as `คอลัมน์ 4 "ข้อเสนอ ตรงข้อกำหนด" √`; no tick columns gives "ไม่พบช่องติ๊ก" as for Word. The command-line argument is now `soc`.
- `python scripts/soc_table.py <SOC file>` prints the rows as JSON lines with their row numbers. Not asked for by the ticket: it is there so a run without a packet (the old flow) does not count Excel rows on its own.
- Instructions: one new section in SKILL.md, "SOC เป็น Excel (`.xlsx`)", 5 lines: no SOC_Check (step 7 still writes results.json and runs the validator; `append_results_to_docx.py` and step 8 are skipped, even when the prompt asks for SOC_Check.docx), what `row` is, the ticks, the reference. `.xlsx` is also named in the `evidence_packet` mode line and twice in evidence-packet.md.
- Same row numbers on both sides: `tests/test_soc_table_excel.py` (13 tests) builds the workbook layouts of `lib/soc-table-excel.test.ts`, and a comment in the web test says a layout added there goes to the skill too. On the real Surat Thani workbook both readers give the same 315 rows (number, item, TOR, offer), compared row by row.
- Skill tests: 138 pass (121 before): 13 for the reader, 4 for the packet from an `.xlsx` (`ExcelSocTest`). Word packets: the existing tests pass unchanged, MOF_RFID included.
- Live run, Sonnet, `claude -p`, item 2.2 of the Surat Thani SOC (8 rows, 1 cited page), from `C:/Phusit/soc04`, harness `../fixtures/04-excel-run/run_excel.py`. The prompt still asked for `out/SOC_Check.docx`, as the Runner's does today. Result: exit 0, `results.json` with 8 rows (91 to 98), validator exit 0 with 0 issues, `check_page_reads` found nothing unread, no SOC_Check file, and Claude's last message says it skipped the Word copy because the SOC is `.xlsx`. Declared status came from the ticks on all 7 ticked rows and matched the decision.
- Use of the run: 100 s, 19 turns, 6,747 output tokens, 57,873 cache-write and 378,967 cache-read input tokens, 0.34 USD at API prices. Quota in pts was not read (no meter reading before and after); `stats.json` in the fixture undercounts output tokens, the numbers here are from the run's final `result` event. The run was made before the review fixes; the packet rebuilt after them is identical.
- /code-review done; fixed: a number in a remark that matches a numbered folder hid the cited file; a tick written as a word ("Comply") with no reference failed the build; a sheet stored outside `xl/worksheets/` was read (the web skips it); a cut-off workbook now gives a message, not a traceback; Thai digits and integers above 2^53 in a number cell.

Left as is:

- Numbers of 1e21 and above or under 1e-6 are written without an exponent (the web writes `1e+21`); a workbook whose sheet id attribute is not written `r:id` is read here and refused by the web. Neither changes row numbers of a file the web accepts.
- job.md's tick heading still says "ไม่ต้องรัน inspect_word_table.py", and the skill's description in the SKILL.md frontmatter still says Word.

For 05:

- `soc-runner/runner.py` `build_evidence_packet` returns "packet ใช้ได้กับ SOC แบบ Word .docx เท่านั้น" for any other file: let `.xlsx` through. Its prompt lines (`OUTPUT_LINE`, the resume prompt) ask for `out/SOC_Check.docx`, and `_carry_out` fails a run without one.
- The sample's SOC folder also holds a Word twin of the SOC; the live run used the `.xlsx` and the catalog folder only.
