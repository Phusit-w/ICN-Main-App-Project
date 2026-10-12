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
| 02 | One SOC table reader in the skill (prefactor) | – | ready-for-agent |
| 03 | Upload an Excel SOC and see its major items | 01 | ready-for-agent |
| 04 | The skill checks an Excel SOC | 02 | ready-for-agent |
| 05 | Excel SOC end to end through the Runner | 03, 04 | ready-for-agent |
| 06 | The web recognises Image Rows | 01 | ready-for-agent |
| 07 | The skill reads Image Rows | 02 | ready-for-agent |
| 08 | Image Rows end to end on the review page | 06, 07 | ready-for-agent |
| 09 | Live acceptance and quota | 05, 08 | ready-for-human |

## Deferred (not ticketed)

- SOC delivered as PDF (exported or scanned): rare, user deferred 2026-10-12.
- Accepting `.doc` / `.xls` directly.
- Reading images inside an Excel SOC.
- Editing an Image Reading and re-checking with the corrected text.
