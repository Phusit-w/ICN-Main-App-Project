# 10: Live acceptance on USO 4 School

**What to build:** A manual end-to-end run of the real file, done by the user. Not committed (file too large, MAX_PATH): run from a short local path with the real Typhoon key.

**Blocked by:** 03, 04, 05, 06, 07, 08, 09. The old Typhoon key must be rotated first, and Typhoon's data retention terms (contact@opentyphoon.ai) should be asked before production use.

**Status:** ready-for-human

- [ ] Upload `uso.pdf` (85 pages); the OCR notice appears and the job shows "กำลังอ่านตาราง" with progress
- [ ] The read finishes in about 100 minutes with about 838 rows and the check buttons turn on
- [ ] Pages 7 and 30 keep their inner table as multi-line text in one cell
- [ ] A sample of rows matches the Sonnet read from the prototype (prototype baseline: 171 of 181 cells identical)
- [ ] Warnings (item gaps, empty TOR, doubled words) are sensible, not noisy
- [ ] The review page opens the right scan for a row
- [ ] A real check on one major item runs on the Runner as for any Excel SOC
- [ ] Cancel a second queued upload and confirm its saved cells are gone after delete
