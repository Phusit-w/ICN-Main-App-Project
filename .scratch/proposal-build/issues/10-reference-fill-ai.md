# 10: กรอกอ้างอิง: ขั้น AI บน Runner

**What to build:** Rows the code step left as ไม่พบ can be sent to AI one major item at a time (confirm popup, cancel), on the user's own Runner or through รอคนรับ; the Runner runs the skill on those rows with the candidate Datasheets and its suggestions (source AI) land in the same review table. Spec story 47.

**Blocked by:** 07, 08

**Status:** done 2026-10-30 (not deployed). Live run passed on local. Left: light/narrow screen check, quota % measurement, upload skill pkg `...2026-10-30-reffill.skill` to prod and re-paste the Runner install command after deploy

- [x] New Check Request kind for กรอกอ้างอิง per major item (like the TOR Match judge), obeying the 07 claim rule.
- [x] Runner handles the kind: downloads the rows + Datasheets, runs the skill, submits suggestions in the code step's shape; Runner version bump (reviewers re-paste the install command after deploy).
- [x] Skill addition for finding references (builds on what `soc-no-page` describes), uploaded as a new Skill Package; never judges compliance.
- [x] Import rejects malformed suggestions (unknown file, page out of range).
- [x] Tests at seam B (test/reference-fill-ai.test.ts) + `soc-runner/test_runner.py` (ReferenceFillTest); skill tests in the skill folder (tests/test_reference_fill_doc.py)
- [x] One live run on a sample (MOF RFID), 2026-10-30, local server + Runner 0.9.0 + skill sha256:037b4f105f2323d9: ข้อ ๕.๒/๕.๓/๕.๔ (14 rows ไม่พบ, references blanked in a copy of the SOC), about 2 min per item. All 10 rows whose original reference has a page got the right document + page. A statement row ("บริษัทฯ ขอยืนยัน...") got a page once (๕.๒ ๔), a heading row (๕.๔) got a page. Quota % NOT measured (read /usage before and after on the next run).
