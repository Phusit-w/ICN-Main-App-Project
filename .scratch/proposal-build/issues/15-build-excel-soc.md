# 15: สร้าง SOC เป็นไฟล์ Excel

**What to build:** Let สร้าง SOC output an Excel (`.xlsx`) draft as well as Word, for TORs whose bidders write the SOC in Excel (Ex1 DOA: Proposals B and I are `.xlsx`; Proposal A has both). Split off from ticket 13 (case group I) on 2026-10-30: it is a new output format (xlsx writer and a template of its own), not a fix to make the Word draft match the real SOC.

**Blocked by:** 05 (done). Best after 13 so the row set is right first.

**Status:** needs-triage (needs a short design pass: Excel template format and where it is stored, one template per output type, how the user chooses Word or Excel in สร้าง SOC, reuse of the existing Excel SOC reader/writer in the checks)

## Evidence

- Real Excel SOCs: `.scratch/proposal-build/fixtures/13-real-soc/Ex1_DOA/Proposal A|B|I/*.xlsx` (git-ignored copies).
- Shape seen: one sheet, header near row 8 (ลำดับ, คุณสมบัติทางเทคนิคตาม TOR, ข้อเสนอ, ชื่อไฟล์เอกสาร/เลขเล่ม/เลขหน้า, ตรงข้อกำหนด, ดีกว่าข้อกำหนด), 6 columns (Proposal A has 22), same TOR rows as the Word version (323 rows; Proposal I 333 with 22 blank rows).

## Acceptance (to be set after the design pass)

- [ ] The user picks Word or Excel when building; the Excel draft carries the same numbered rows as the Word draft.
- [ ] The Excel draft opens in the existing SOC Version upload and checks without changes.
- [ ] Tests at the same seam as `test/soc-builds.test.ts`.
