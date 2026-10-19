# 10: Live acceptance on USO 4 School

**What to build:** A manual end-to-end run of the real file, done by the user. Not committed (file too large, MAX_PATH): run from a short local path with the real Typhoon key.

**Blocked by:** 03, 04, 05, 06, 07, 08, 09. The old Typhoon key must be rotated first, and Typhoon's data retention terms (contact@opentyphoon.ai) should be asked before production use.

**Status:** closed (2026-10-19, user: stop here, move on; remaining boxes not verified. ผนวก ๒ splits into 20 parts per 0ccd754; ๒.๑๒ checked once on the Runner, result not reported)

- [ ] Upload `uso.pdf` (85 pages); the OCR notice appears and the job shows "กำลังอ่านตาราง" with progress
- [ ] The read finishes with about 838 rows and the check buttons turn on. Expected about 99 minutes at the old fixed 20 per minute, about 62 minutes after ticket 11. Record the real time, the number of cells sent, and how many calls were rate-limited: this decides whether the local-OCR shortcut (ADR 0010 amendment) is worth doing
- [ ] Pages 7 and 30 keep their inner table as multi-line text in one cell
- [ ] A sample of rows matches the Sonnet read from the prototype (prototype baseline: 171 of 181 cells identical)
- [ ] Warnings (item gaps, empty TOR, doubled words) are sensible, not noisy
- [ ] The review page opens the right scan for a row
- [ ] A real check on one major item runs on the Runner as for any Excel SOC
- [ ] Cancel a second queued upload and confirm its saved cells are gone after delete

## Results

- 2026-10-16 (user, live on prod): started 11:10, read finished 13:33 = 2 h 23 min (143 min) against the ~100 min estimate. The first box (upload, OCR notice, "กำลังอ่านตาราง" with progress) and the time box are not ticked: only the end time was reported; row count (~838), check buttons on, pages 7/30, sample match, warnings, review page, real check and cancel/delete are still to report.
- 2026-10-16 (user pasted the job warnings, live USO):
  - Duplicate item numbers: ๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘ ๙ ๑๐ "and 53 more" = 63 numbers. Likely noisy if the TOR restarts numbering per section (not checked); also makes the duplicate list useless as a misread signal.
  - Doubled words: 10 named (rows of pages 1, 2, 14; items ๓.๑, ๓.๒, ๔.๑.๗, ๔.๑.๘, ๔.๒.๒.๓, ๔.๒.๒.๙, ๔.๓.๑.๑) "and 20 more" = 30 rows. Not checked how many are real OCR repeats.
  - "มีรูป 2 รูปในไฟล์ Excel ที่ยังไม่อ่าน": 2 figure-only cells became pictures (the Excel-SOC Image Row gap noted in ticket 01).
  - Warnings box left UNTICKED: judged noisy until the duplicate list is explained.
- 2026-10-16 (user): for this job only ภาคผนวก ๒ needs a real check. So the live acceptance (sample vs Sonnet, pages 7/30, review page, real check on a major item) is judged on ภาคผนวก ๒ alone. The 63 duplicate item numbers are then probably numbering that restarts in each ภาคผนวก (not confirmed): candidate fix = warn about duplicates only inside one major item.
