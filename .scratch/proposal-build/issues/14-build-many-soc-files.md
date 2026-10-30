# 14: สร้าง SOC หลายไฟล์จาก TOR ชุดเดียว (แยกตามส่วน/อุปกรณ์)

**What to build:** Let one build produce several SOC files for one TOR, split by section or by equipment item, so a TOR like NT (invitation, commercial, general, scope, appendices 1–4 = 7 SOC files per bidder) or PEA (invitation, one per equipment datasheet 2.2.1–2.2.12, conditions, technical, appendix = ~16 files per bidder) gets the same file layout the people really wrote. Split off from ticket 13 (case group F) on 2026-10-30: decided to keep ticket 13 to one file per build and the user splitting by hand until this ticket.

**Blocked by:** 13 (single-file formats right first), 12 (both sample TORs are scanned, 127 and 154 pages).

**Status:** needs-triage (needs a design pass: does a Proposal hold many builds / many SOC Versions per TOR, how the user names the split points, how the split interacts with ตรวจ TOR ตรงต้นฉบับ per file; ADR 0012 says Proposal owns files + SOC Versions)

## Evidence

- Real SOCs: `.scratch/proposal-build/fixtures/13-real-soc/Ex3_NT/Proposal A|S|U/` and `Ex5/Proposal A|F/` (git-ignored copies; see ticket 13 "Findings 2026-10-30", group F and G).
- Each PEA equipment file is a spec table (10–124 rows) with a heading row carrying the spec number and a merged fixed-reference column.

## Acceptance (to be set after the design pass)

- [ ] Decide the split model with the user (page ranges per file chosen by the user, or headings found by Claude after 12).
- [ ] Match rate per file against the real SOC, same method as ticket 13.
- [ ] Tests at the same seam as `test/soc-builds.test.ts`.
