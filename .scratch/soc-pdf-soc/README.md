# Text PDF SOCs: progress board

> **เริ่ม session ใหม่ทุกครั้ง อ่านไฟล์นี้ก่อน**

Spec: `spec.md` (grilled 2026-10-14). Glossary: PDF SOC and Scanned PDF SOC in `docs/SOC-DOMAIN-GLOSSARY.md`. Decision: ADR 0009 (a PDF SOC becomes an Excel SOC on upload).

## How to continue

1. Say **`/implement .scratch/soc-pdf-soc/issues/<NN>-....md`**. Pick the first `ready-for-agent` ticket whose blockers are all `done`. 02, 03 and 04 can go in any order after 01.
2. At the end of every session, update the ticket's `Status:` and checkboxes, add a dated note under `## Comments`, and update this board.
3. Samples (outside git, paths exceed MAX_PATH, copy to a short folder): see spec Further Notes.

## Board

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | Upload a text PDF SOC and get an Excel SOC job | – | done (not pushed) |
| 02 | Scanned pages, upload warnings and the Word-file advice | 01 | ready-for-agent |
| 03 | No item-number column: the item number comes from the TOR text | 01 | ready-for-agent |
| 04 | "ดูหน้า PDF SOC" on the review page | 01 | ready-for-agent |
| 05 | Live acceptance on Surat CASRI | 01, 02, 04 | ready-for-human |

Next feature after this: Scanned PDF SOCs. Start with `/prototype` on the USO 4 School PDF, comparing OCR on the server with Claude reading page images on the Runner.
