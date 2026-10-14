# SOC Image Rows and Excel SOCs: progress board

> **เริ่ม session ใหม่ทุกครั้ง อ่านไฟล์นี้ก่อน**

Spec: `spec.md` (grilled, prototyped and accepted 2026-10-12). Glossary terms: Image Row, Image Reading, Picture Row, Excel SOC in `docs/SOC-DOMAIN-GLOSSARY.md`.

## How to continue

1. Say **`/implement .scratch/soc-image-rows/issues/<NN>-....md`**. Pick the first `ready-for-agent` ticket whose blockers are all `done`. The user's order: the Excel lane first (01, 02, 03, 04, 05), then the Image Row lane (06, 07, 08), then 09.
2. At the end of every session: update the ticket's `Status:` and checkboxes, add a dated note under `## Comments`, and update this board.
3. Skill tickets (02, 04, 07) edit the skill outside the repo (`ICN Apps/SOC model compliance/Skill/tor-word-compliance-check/`).
4. Samples (outside git, paths exceed MAX_PATH, copy to a short folder): `ICN Apps/Example SOC+TOR+Datasheet/2. MEA_…` (Word, 19 Image Rows) and `4. DOAXXX_Apron_…` (Excel).

## Board

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | One SOC table reader on the web (prefactor) | – | done (2026-10-12) |
| 02 | One SOC table reader in the skill (prefactor) | – | done (2026-10-12) |
| 03 | Upload an Excel SOC and see its major items | 01 | done (2026-10-12) |
| 04 | The skill checks an Excel SOC | 02 | done (2026-10-12), skill outside git, no package uploaded |
| 05 | Excel SOC end to end through the Runner | 03, 04 | done (2026-10-12), Runner 0.5.0, not deployed |
| 06 | The web recognises Image Rows | 01 | done (2026-10-12), not pushed, not deployed |
| 07 | The skill reads Image Rows | 02 | done (2026-10-12): live MEA runs 2.5 (mixed), 1.7 (picture), 1.12 OK; skill outside git, no package |
| 08 | Image Rows end to end on the review page | 06, 07 | done (2026-10-14), Runner 0.6.0 |
| 09 | Live acceptance and quota | 05, 08 | ready-for-human: pushed to origin/main 2026-10-14, package `2026-10-14-images` built; upload, deploy, re-install and the live runs are the user's |
| 10 | A SOC divided into ผนวก: each ผนวก is a major item | 08 | ready-for-human: code done 2026-10-14, package `2026-10-14-annex` built; upload, deploy, re-create the MEA job |

The Excel lane (01 to 05) is complete and can be deployed on its own if the user asks: upload the Skill Package first, then deploy (one migration), then reviewers re-install the Runner (0.5.0). See the end of ticket 05.

## Deferred (not ticketed)

- SOC delivered as PDF (exported or scanned): rare, user deferred 2026-10-12.
- Accepting `.doc` / `.xls` directly.
- Reading images inside an Excel SOC.
- Editing an Image Reading and re-checking with the corrected text.

## Found on the way (2026-10-12)

- **MEA Y69 SOC is a `.doc`**, not `.docx`: it must be saved as `.docx` before upload (the web now says so).
- **MEA major items come out wrong today.** Its table has no header row inside the table and restarts item numbers in every ผนวก (7 to 21): each ผนวก starts with an unnumbered row "ผนวก N" and then 1., 2., 1.1 … again. The web reads that as one ข้อ 1 split into 1.1, 1.2 … mixing all ผนวก. Decided by the user 2026-10-14: each ผนวก is a major item (ticket 10).
- **MEA rows have 6, 7 or 8 cells**; the reference (the "หมายเหตุ (คำอธิบายเพิ่มเติม)" column) is always at grid column 9 but at cell 5, 6 or 7 of the row. The skill's `reference_columns` picks one cell position per table, so it would miss the reference on 86 of 296 cited rows. Fix with ticket 07 (use the grid column, which `SocCell.column` has).
