# A scanned PDF SOC is read by Typhoon OCR in the background, on the server

Decided 2026-10-16. A scanned PDF SOC is accepted at upload. The server cuts the table into cells along the ruled lines (no OCR needed for that), sends each cell as an image to the Typhoon OCR API (`typhoon-ocr`, one cell per call), and builds the same `.xlsx` as ADR 0009. The job exists at once in the status "กำลังอ่านตาราง" and becomes an ordinary Excel SOC when the read finishes. We chose this because it keeps ADR 0009 (one table reader on the server, no new Skill Package or Runner version) and costs no Claude Pro quota.

## Measured on USO 4 School (85 scanned pages, 838 rows)

- Typhoon per cell: 171 of 181 cells identical to a Sonnet read, and it fixed 3 Sonnet misreads. Whole-page Typhoon was not good enough (merged rows, lost text, made-up tables).
- Sonnet on the Runner: accurate, but about 75 Pro quota points per file.
- PaddleOCR on the server CPU: 57% identical and about 380 minutes per file. Rejected. Google Cloud Vision: dropped, no billing.
- Typhoon limit is 20 requests per minute (documented), so a file takes about 100 minutes. This is accepted because it runs in the background.

## Decisions

- Work runs inside the existing web process. Each cell result is saved to disk, so a restart or deploy resumes where it stopped.
- One shared `TYPHOON_API_KEY` in the server `.env`. Without it a scanned PDF is refused, as today.
- One scanned job is read at a time (FIFO). Later jobs show "รอคิวที่ N". The 20 per minute limit is shared, so parallel jobs would not be faster.
- Cancel or delete stops the Typhoon calls at once. Cells already read are kept until the job is deleted for good, so a cancelled read can be resumed.
- Failed calls retry with a delay. If they keep failing, the job becomes "อ่านตารางไม่สำเร็จ" with a resume button. A partial `.xlsx` is never made silently.
- A table inside a TOR cell becomes multi-line text in that cell. If Typhoon answers with only a figure, the row is an Image Row.
- A page whose grid cannot be cut is skipped and named as a warning. If more than half of the table pages fail, the file is refused.
- A mixed PDF is decided per page: text pages use the ADR 0009 reader, scanned pages use Typhoon, merged in page order. A PDF with no scanned table page never calls Typhoon.
- There is no per-row human confirmation. The job warns on item-number gaps or duplicates, empty TOR cells and doubled words. The review page opens the source page.
- Before upload the user must confirm each time that the file goes to an external OCR service ("ไฟล์นี้จะส่งไป OCR ภายนอก").

## Consequences

- Bid documents leave the company network for Typhoon (SCB 10X). The user confirmed on 2026-10-15 that this is allowed. Typhoon's data retention terms were NOT found in its public docs; ask contact@opentyphoon.ai before relying on them. No daily or monthly cap is documented.
- The earlier leaked Typhoon key must be rotated before the shared key goes into `.env`.
- The grid cutter is ported from the prototype `.scratch/soc-scanned-pdf/prototype/PROTOTYPE_grid.mjs`. It needs a lower ink threshold, because two short cells were called empty.
- Fallbacks if Typhoon fails in production: Sonnet on the Runner (about 75 points per file), or Azure Document Intelligence (untested).
