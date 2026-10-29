# 12: Claude อ่าน TOR แบบสแกน (แทน OCR ภายนอก)

**What to build:** When the uploaded TOR is a scanned PDF, the user chooses how it is read: the outside OCR (Typhoon, with today's confirm popup) or Claude on their own Runner (or through รอคนรับ when they have none). Choosing Claude sends nothing outside the system, needs no OCR key and no OCR confirm, and uses the quota of whoever runs it. The pages' text lands in the Proposal exactly where the OCR read would put it, so สร้าง SOC and ตรวจ TOR ตรงต้นฉบับ use it unchanged. Raised by the user 2026-10-29 while checking ticket 02 ("ตอนสแกน TOR อยากให้ใช้ Claude ตรวจได้ด้วย" → "ให้ Claude อ่านแทน OCR").

**Blocked by:** 02, 07 (the claim rule and รอคนรับ); 05/06 are the consumers and can start with OCR-only first.

**Status:** ready-for-agent (needs a short grill: how Claude's read output is validated, and whether a scanned-TOR read may be split per page range)

- [ ] ProposalTor records how a scanned TOR is read (`ocr` | `claude`) and its read state (waiting, reading, ready, failed); the TOR step shows it ("กำลังอ่านด้วย Claude", "รอคนรับ") and stays เสร็จ only when readable.
- [ ] The upload form asks which reader for a scanned TOR; `claude` skips the OCR key and OCR confirm checks of ticket 02; `ocr` behaves as today.
- [ ] New Check Request kind for reading TOR pages, obeying the 07 claim rule (own Runner by default, รอคนรับ without one, cancel by asker); Runner handles it: downloads the TOR PDF, runs the skill page by page, submits page text in the shape `scannedTorPages` produces; Runner version bump (reviewers re-paste the install command after deploy).
- [ ] Skill addition for reading scanned TOR pages (transcribe only, no judging); uploaded as a new Skill Package.
- [ ] Import rejects malformed output (page count mismatch, empty pages); the result records who ran it ("อ่านโดย ข (บัญชีของ ข)").
- [ ] Marked Beta like the OCR read; a Claude-read TOR shows the same "อ่านด้วยเครื่อง อาจผิด" note.
- [ ] Tests at seams A/B; Runner test in `soc-runner/test_runner.py`; one live run on a real scanned TOR to measure quota.
