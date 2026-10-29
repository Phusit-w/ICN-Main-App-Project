# 10: กรอกอ้างอิง: ขั้น AI บน Runner

**What to build:** Rows the code step left as ไม่พบ can be sent to AI one major item at a time (confirm popup, cancel), on the user's own Runner or through รอคนรับ; the Runner runs the skill on those rows with the candidate Datasheets and its suggestions (source AI) land in the same review table. Spec story 47.

**Blocked by:** 07, 08

**Status:** ready-for-agent

- [ ] New Check Request kind for กรอกอ้างอิง per major item (like the TOR Match judge), obeying the 07 claim rule.
- [ ] Runner handles the kind: downloads the rows + Datasheets, runs the skill, submits suggestions in the code step's shape; Runner version bump (reviewers re-paste the install command after deploy).
- [ ] Skill addition for finding references (builds on what `soc-no-page` describes), uploaded as a new Skill Package; never judges compliance.
- [ ] Import rejects malformed suggestions (unknown file, page out of range).
- [ ] Tests at seam B + `soc-runner/test_runner.py`; skill tests in the skill folder; one live run on a sample (MOF RFID) with quota noted.
