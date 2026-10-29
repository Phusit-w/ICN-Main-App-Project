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

## Quota plan (asked by the user 2026-10-29: "ลดโควตาแต่ความแม่นยำเท่าเดิมให้มากที่สุด")

Reading a scanned TOR is transcription, not judgement, so the aim is: Claude sees as few page images as possible, once, and code (free) checks the result. Levers, biggest saving first; each is measured against the baseline in the last box before it is kept (the rule from the evidence-packet work: a saving that costs accuracy is dropped, quality is the gate).

- [ ] **Read once, reuse everywhere.** Store the page text per Proposal TOR (keyed by the file's sha256) and let สร้าง SOC, ตรวจ TOR ตรงต้นฉบับ and กรอกอ้างอิง all use it; a replace invalidates it, the same file in another Proposal copies it. No consumer ever asks Claude to read the same page twice.
- [ ] **Send only pages that need Claude.** Pages with a text layer (`readTextTor` per page) are extracted by code for free; cover, contents, signature and boilerplate pages (the header/footer detection `scannedTorPages` already has, plus a cheap "page is almost blank / mostly picture" test) are skipped or marked picture. A consumer that needs a page range (สร้าง SOC) reads only that range, lazily, and caches it per page.
- [ ] **Make each image cheap.** Code renders each page once at the smallest size that keeps Thai readable (about 150 dpi, grayscale, margins and repeated header/footer cropped, long edge ≤ 1568 px: more pixels cost tokens and add no accuracy). Pick the size by test on Thai digits and small table text.
- [ ] **Several pages per call, one session.** Reuse the shared prompt cache (Runner 0.4.0): the skill text is paid once, pages go in batches of about 5–10, so the context stays small (growing context is re-read on every turn). Find the batch size by measuring points per page.
- [ ] **Cheapest model that holds accuracy.** Transcription may not need the model used for judging: measure Haiku / Sonnet / Opus on the same pages (previous measurement: Sonnet equal to Opus at lower quota). The Runner takes the model per request kind.
- [ ] **Free pre-pass, Claude only where it is unsure** (to try, may be dropped): a local OCR that needs no quota reads first; Claude re-reads only pages where the local read fails the code checks below. Drop it if Thai digits or table text lose accuracy.
- [ ] **Code checks, then re-read only what failed.** Instead of reading everything twice: page count matches; item numbers run in sequence (๑.๑, ๑.๒ … no gap, no repeat, Thai digits kept); no empty page that has ink; for a Proposal that already has a SOC, the TOR text of each SOC row is found in the read (TOR Match's own matcher). A failing page is re-read alone, once.
- [ ] **Short output.** The skill returns plain page text only (no description of figures, no commentary), one block per page; output tokens cost more than input.
- [ ] **Measure before keeping each lever.** On one real scanned TOR (ask the user for one; MOF/Apron TORs are text), record quota points and the character/number error count against a hand-checked page set for: baseline (all pages, one image per call, Opus) vs each lever alone vs all kept. Write the table into this ticket; keep a lever only when accuracy is equal.
