# 09: กรอกอ้างอิง: เขียนฉบับ SOC ใหม่

**What to build:** "สร้างฉบับ SOC ใหม่" writes the accepted suggestions into a new SOC Version in the Proposal's Reference Style (guessed, switchable), refusing with a list when any written reference would not read back to its file and page through the check's reader. Word stays Word, Excel stays Excel. Spec stories 53, 59–62, 64–66; ticket 09 of the map holds the text rules.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Reference Style guess (existing references → แบบไทย/แบบอังกฤษ; else TOR text language), switch on the page, stored on the Proposal.
- [ ] แบบไทย: `เอกสารส่วนที่ N` (N from the numbered top folder; wording copied from existing rows; omitted without such folder) / sub-folder name / file-name line when the folder has >1 PDF / `หน้า 3, 6` or `หน้า 12-13`; several documents as separate blocks. Expected text matches the MOF RFID sample.
- [ ] แบบอังกฤษ: `<Citation Name>, page 3, 6`; several documents joined by `; `. Expected text matches the Apron sample.
- [ ] Title-only rows: append `หน้า N` on a new line or `, page N`; existing text untouched; full references never touched; unaccepted rows left empty.
- [ ] Read-back guard using the same rules as the check's reader (shared with 08's port); blocking warning lists the rows.
- [ ] New version (source reference_fill) reads back through the SOC table reader with the same rows; table look kept.
- [ ] Tests at seam C. Browser check.
