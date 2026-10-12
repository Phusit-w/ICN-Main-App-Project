# 04: The skill checks an Excel SOC

**What to build:** A Local Check Run on one major item of an Excel SOC produces a valid results file by the same rules as a Word SOC, and no SOC_Check copy.

- The skill's SOC reader accepts `.xlsx` with the same sheet, header, row-number and tick rules as the web (ticket 03); the two must number rows identically.
- The Evidence Packet has the same shape as for a Word SOC.
- The step that appends results to a Word copy is skipped for an Excel SOC, and the instructions a run reads say so in one place.

Skill work, outside this repo. Do not upload a Skill Package (ticket 09 does).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Row numbers and items from the skill's reader match the web reader's for the same workbook (a test in each place uses the same small workbook layout)
- [ ] A `claude -p` Sonnet run on one major item of the Surat Thani sample (run from a short work folder) ends with a results file that passes the validator, with every packet page Read
- [ ] The run writes no SOC_Check and does not fail for lacking one
- [ ] A Word SOC run is unchanged (existing skill tests pass)
- [ ] Quota or token use of the run is noted in Comments

## Comments

**2026-10-12 (from the user, during ticket 03):** some SOCs write the reference in the หมายเหตุ column. The web reader takes the หมายเหตุ/Remark column as the reference column when no column is named as one (อ้างอิง, เลขหน้า, ชื่อไฟล์, Reference …). The skill's Excel reader must do the same, since a row with text only in that column counts as a SOC row. For a Word SOC the packet builder already finds the reference column by what the cells say; its header fallback only knows อ้างอิง/Reference, so add หมายเหตุ there too. The exact row and header rules are at the top of `lib/soc-table-excel.ts`.

**2026-10-12, after ticket 03 (replaces the note above where they differ):** the reference column and the หมายเหตุ/Remark column are two separate optional columns in the web reader; text in either makes a SOC row. For the packet, the row's reference should be the reference cell plus the remarks cell. Also owned by this ticket: the declared Comply/Better from the tick columns (the web reader does not give it out), and the 0.00 number-format rule for item numbers typed as numbers. A small workbook layout used by a test on both sides is the safest way to keep row numbers identical; `lib/soc-table-excel.test.ts` has the layouts.
