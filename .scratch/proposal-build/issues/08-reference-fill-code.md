# 08: กรอกอ้างอิง: ขั้นโค้ดและตารางรับ/แก้

**What to build:** On the current SOC Version a user starts กรอกอ้างอิง; the server's code search runs over the whole SOC at once and a review table shows, per row with an empty or title-only reference, a suggestion (document, PDF page, matching snippet, source เลขข้อกำกับ/ค่าสเปก) with up to two alternatives and a page viewer, or ไม่พบ. The user รับ / แก้ / ไม่รับ each, or "รับทั้งหมดที่พบจากเลขข้อกำกับ"; counts พบ N / ไม่พบ M on top. Nothing is written to a file yet. Spec stories 44–46, 48–52, 54–58.

**Blocked by:** 03, 04

**Status:** done (browser check left to user; not deployed)

- [ ] One public code-step function: SOC table + Proposal Datasheets → per-row suggestions or ไม่พบ; reuses the SOC table reader and ports the Evidence Packet builder's reference-column finder, item-label extraction and page mapping (one shared implementation, not a second copy per caller).
- [ ] Label match (item label on a Datasheet page), spec-value match against the row's TOR text, title-only rows searched only in the named document, full references skipped, heading rows and ไม่ต้องตรวจ major items left out; PDF page numbers.
- [ ] Reference Fill state stored per run (suggestions + decisions) so the user can work in passes.
- [ ] Review table with decisions, bulk accept by label, viewer reuse from the review page; step status กำลังทำ while undecided rows remain.
- [ ] Tests at seam C with fixture Word/Excel SOCs and Datasheet PDFs (prior art `lib/soc-builder.test.ts`, `test/docx-fixture.ts`, `test/pdf-fixture.ts`), plus seam A for state/decisions. Browser check.
