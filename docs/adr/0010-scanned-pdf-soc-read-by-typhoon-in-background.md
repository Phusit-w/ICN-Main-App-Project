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

## Amendment 2026-10-16: pace, and checking while the read is still running

The user asked for a read of 30 minutes or less (5-10 minutes would be very good) with very high accuracy, with no payment possible, no way to get a higher Typhoon limit, no GPU on the server, and no willingness to spend Claude quota on reading. Measured the same day on the 237-cell prototype set:

- Typhoon accepts about 32 cells per minute (456 s with 2 parallel calls, 440 s with 4, identical text), more than the 20 per minute it documents. USO (about 1,991 non-empty cells) therefore takes about 62 minutes, not 99. Parallel calls do not help. 30 minutes would need at most about 960 calls.
- Rejected after measuring against the Typhoon cells (which are 171 of 181 identical to Sonnet): RapidOCR and EasyOCR on CPU (55% and 48% lenient match; they agree on only 33% of cells, all short boilerplate), Gemini 3.8 Flash on whole pages (90%; rewrote one TOR sentence, dropped a tick box; free tier is 20 requests per day and Google may train on unpaid input), Haiku 5.5 on the Runner (93%; swapped "ผู้ว่าจ้าง" for "ผู้รับจ้าง" in one sentence; about 34% cheaper than Sonnet, so about 50 points per file). Details: `.scratch/soc-scanned-pdf/RESEARCH-thai-ocr-options.md`.

Decisions:

- The call pace is a setting (default 30 per minute) instead of a fixed 20. A rate-limit answer already backs off and retries, so if Typhoon starts enforcing 20 the read slows to about 99 minutes and does not fail.
- The rule "check buttons stay off until the whole file is read" is replaced: a major item can be checked once all of its rows are read, while later pages are still being read. The reviewer starts within minutes; the whole file still finishes in about 62 minutes. An item that may continue on a page not yet read is not ready.
- Not done, for now: a local OCR engine that skips Typhoon calls for repeated boilerplate offer cells (would save about 20 minutes, needs Python and onnxruntime on the production server). Revisit if the live run shows the read is much longer than 40 minutes.
- Accuracy stays as measured (about 1% real errors), with the source page one click away on the review page and the quality warnings. TOR and offer cells are the ones where a doubtful reading matters most, so a later change may re-read only cells that trigger a warning.

## Consequences

- Bid documents leave the company network for Typhoon (SCB 10X). The user confirmed on 2026-10-15 that this is allowed. Typhoon's data retention terms were NOT found in its public docs; ask contact@opentyphoon.ai before relying on them. No daily or monthly cap is documented.
- The earlier leaked Typhoon key must be rotated before the shared key goes into `.env`.
- The grid cutter is ported from the prototype `.scratch/soc-scanned-pdf/prototype/PROTOTYPE_grid.mjs`. It needs a lower ink threshold, because two short cells were called empty.
- Fallbacks if Typhoon fails in production: Sonnet on the Runner (about 75 points per file), or Azure Document Intelligence (untested).
