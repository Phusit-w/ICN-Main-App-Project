# 13: สร้าง SOC รองรับ TOR หลายรูปแบบ (จากตัวอย่างจริง)

**What to build:** Make สร้าง SOC (ticket 05 and the older build, `lib/soc-builder.ts`, `lib/soc-builds.ts`) produce a draft that matches the SOC people really wrote, across the TOR and SOC pairs in `Example SOC+TOR+Datasheet/TOR+SOC` (5 customers). Work in rounds: build a draft from each sample TOR, compare it row by row with the real SOC, group the differences into cases, fix one case group at a time with a test that uses the sample. Raised by the user 2026-10-30 ("มีหลายเคสมากเลย ควรทำแยกเป็นอีก ticket").

**Blocked by:** 05 (done). The TOR-vs-draft comparison is blocked by 12 (every sample TOR is scanned, see Findings).

**Status:** blocked by 12 for the TOR-vs-draft comparison (2026-10-30: real-SOC survey, case groups A–K and the four scope decisions are written below; F moved to ticket 14, I to ticket 15; J DONE 2026-10-30: template upload names Save As for .doc; SOC upload already did)

## Samples (as found 2026-10-30; the folder is the source of truth)

| Group | TOR | Real SOC (by bidder) | What is different |
|---|---|---|---|
| Ex1_DOA | `Attach_TOR_1.pdf` (17 MB) | Proposal A `.docx` (CASRI, 322 rows), Proposal B and I `.xlsx` | Word and Excel SOCs for one TOR; the Word one is the DOA Apron table (template made from it: `output/SOC-Template-DOA-Apron-v3.docx`). Column headings live in the page header. |
| Ex2_MOF | `TOR RFID.pdf` (13 MB) | Proposals A, B, C `.doc` | Legacy `.doc` SOCs (upload refuses them: Save As `.docx` first). MOF RFID is the fixture the checks already use. |
| Ex3_NT | three PDFs: `เงื่อนไข+ข้อกำหนด`, `ภาคผนวก`, `หนังสือเชิญชวนเสนอราคา` | Proposals A, S, U: one `.doc` per section (S0.1 invitation, S0.2 commercial, S1 general, S2 scope, S3 ภาคผนวก 1 …) | TOR split over several PDFs; the SOC is several files, one per section, so "which SOC row is the spec part" differs from the single-table case. |
| Ex4_OBEC | `tor-tablet69.pdf` (18 MB) | one `.doc` | Single `.doc` SOC. |
| Ex5 (PEA) | `TOR-PEA-CED-20-2026_Final.pdf` (11 MB) and two invitation PDFs | Proposals A and F: ~15 `.doc` each (one per datasheet, plus `ข้อกำหนดและเงื่อนไข`, `ความต้องการด้านเทคนิค`, `ภาคผนวก`) | Many small SOC documents, one per equipment item. |

Some folders in the listing were elided in the first read (Ex1 Proposal list, NT Proposal S/U tails); re-list before starting. Whether each TOR PDF has a text layer or is scanned is **not yet checked**: check it first, it decides which cases wait for ticket 12.

## First step: the comparison run (no code change)

- [ ] For each pair, convert the real SOC to `.docx`/`.xlsx` where it is `.doc` (Word is on this machine; do not edit the originals, work on copies under `.scratch/proposal-build/fixtures/13-…`).
- [ ] Say per TOR: text or scanned, page count, where the specification part starts (the page `autoPageRanges` picks vs the page the real SOC covers).
- [ ] Build a draft with no pages chosen and with the real pages; compare item numbers and TOR text with the real SOC's rows (reuse `lib/soc-tor-match.ts`). Report per pair: rows matched, rows only in the draft, rows only in the real SOC, and the first 10 differences.
- [ ] Group the differences into named case groups (for example: item numbering style, items split over a table, pictures in place of text, several documents, a TOR that restarts numbering per section). Write the groups and the proposed acceptance numbers into this file, then stop for the user's review before fixing anything.

## Findings 2026-10-30 (comparison run, real-SOC side only)

**Every TOR PDF in the set is scanned** (0 text pages out of 39 / 18 / 44 / 127 / 5 / 16 / 154 / 2 / 2). So no draft can be built and compared yet: the "draft vs real SOC" rows of the first step, and `autoPageRanges`, wait for ticket 12. Status below: real-SOC survey done, TOR comparison **blocked by 12**.

Copies: `.scratch/proposal-build/fixtures/13-real-soc/` (64 files, `.doc` converted to `.docx` with Word, none failed; git-ignored, customer documents). Surveys: `fixtures/survey.txt`, `fixtures/summary.txt`.

### Case groups seen in the real SOCs (proposed; for the user's review)

| # | Case group | Where | What the real SOC does |
|---|---|---|---|
| A | One big table, 3 cols + reference | MOF (4 cols, 355 rows, all 3 bidders same rows), OBEC (4 cols, 183 rows) | Column 1 = item number, 2 = TOR text, 3 = offer, 4 = reference. The whole TOR is in the table, not only the spec: background, objectives, qualification rows all get the pre-filled reply "บริษัทฯ ยอมรับตามข้อกำหนด". Clause rows with no number are paragraph continuations. |
| B | Item numbering styles | all | Thai digits ๑. / ๑.๑ / ๑.๑.๑ (DOA, MOF), Arabic 1. / 1.1 (OBEC, NT, PEA), parenthesised (๑) (MOF 15 rows, PEA ODF), ก. letters, and "other" (MOF 81 rows: mostly numbers with a trailing text or ๕.๑-style sub-items). `lib/soc-builder.ts` must keep the TOR's own style, not renumber. |
| C | Deep numbering (3–4 levels) | DOA (281 rows d.d.d, up to ๑.๒.๙.๒), PEA | Same numbering depth as TOR; 6 rows in DOA with free text in column 1. |
| D | Header and title rows | DOA (title row full width + header lives in the page header), MOF (header in the page header), NT/PEA (title rows inside the table) | Column headings are not always the first table row; a template must put them in the page header (as Apron template v3 does) or in row 1. |
| E | Pre-filled reply column | MOF, OBEC, NT ("รับทราบและปฏิบัติตามข้อกำหนดของ บมจ. โทรคมนาคมแห่งชาติ"), PEA ("…กฟภ."), DOA no | Rows that are not specs get an "accept" sentence per customer; spec rows get the offer + reference. The draft should not guess the sentence: leave blank or take it from the template. |
| F | TOR split into several SOC files | NT (7 files per bidder: S0.1 invitation, S0.2 commercial, S1 general, S2 scope, S3 appendices 1–4 each its own file), PEA (~16 files per bidder: invitation, one per equipment datasheet 2.2.1–2.2.12, conditions 2.3, technical 2.4, appendix 2.5) | One TOR PDF (or three) → many SOC documents, split by section/equipment. Proposal needs "one build per section" or a multi-file build; today one TOR → one SOC. |
| G | Equipment datasheet SOC (spec table per item) | PEA 2.2.x (10–124 rows), DOA | Rows are the equipment spec lines (1., 1.1, 1.2 …) with a heading row carrying the spec number; the PEA column 5 (a fixed reference text "เอกสารส่วนที่ 2 บทที่ 6 …") is merged down the whole table. |
| H | Merged cells | NT (6–7 cols with merged middle cols), PEA (merged column 5 down all rows), DOA (merged 2–5 for section rows) | Reply or reference cells merged vertically/horizontally; the builder's template must not assume one cell per column. |
| I | Word and Excel versions of the same TOR | DOA (A = .docx + .xlsx, B, I = .xlsx; B 323 rows, I 333 rows (22 blank rows)) | Excel: header at row ~8 (ลำดับ, คุณสมบัติตาม TOR, ข้อเสนอ, ชื่อไฟล์/เลขหน้า, ตรงข้อกำหนด, ดีกว่า), 6 or 22 columns; same TOR rows as the Word. Build currently outputs Word only. |
| J | Legacy `.doc` input | MOF, NT, OBEC, PEA | Upload refuses `.doc` (save as `.docx` first): not a build problem, noted for the upload message. |
| K | Scanned TOR | all 9 PDFs | Needs ticket 12 (Claude reads), and page-range finding for 154-page PEA and 127-page NT appendix. |

Row counts agree across bidders for the same TOR (MOF 355/356/355; DOA 322/323/323, I 333): the SOC's row set is stable per TOR, so one real SOC per TOR is a usable answer key.

### Proposed acceptance numbers (to confirm)

- Item-number match against the real SOC (after Thai→Arabic normalisation): ≥ 95% of the real SOC's numbered rows appear in the draft with the same number, for MOF, OBEC, DOA, and each PEA/NT file that has a TOR section; rows only in the draft ≤ 5%.
- Non-numbered continuation rows: not counted (match on numbered rows only).
- Reply column text is not compared (E): left blank or from the template.
- Group F (several files) and I (Excel output) are separate decisions: build whole, split later (user to choose).

### Decisions (user agreed all four, 2026-10-30)

1. F (several SOC files per TOR): **out of scope**, one file per build, the user splits by hand. Moved to ticket 14.
2. I (Excel output): **out of scope**, moved to ticket 15.
3. E (pre-filled reply sentence): the draft leaves the reply column **blank**; a customer sentence comes from the user's own template.
4. Acceptance: compare **numbered rows only**; at least 95% of the real SOC's numbered rows appear in the draft with the same number (after Thai to Arabic digit normalisation) and rows only in the draft are at most 5%. Adjust after the first real numbers.

### Scope left in this ticket

Case groups A–D and G–H (item numbering styles and depth, one big table with the whole TOR, column heading placement, merged cells), plus J (the upload message for legacy `.doc`). K (scanned TOR) waits for ticket 12: the per-TOR draft-vs-real comparison and `autoPageRanges` checks cannot start until a scanned TOR can be read. Suggested first group to fix once 12 is done: **B** (numbering styles; every pair needs it), then A/D (MOF and OBEC single tables), then C/G/H.

## Then, per case group

- [ ] A failing test built from the sample (a trimmed fixture, not the 17 MB file) → the fix → the pair's match rate goes up without any other pair's going down (keep a table of match rates in this file and update it each round).
- [ ] Cases that need Claude to read a scanned TOR, or to find the specification pages of a scanned TOR, are only noted here and handed to ticket 12.

## Acceptance (to be set after the comparison run)

- [ ] Every pair has a recorded match rate before and after; the user agrees which differences are acceptable ("ตรวจเอง") and which must be fixed.
- [ ] `autoPageRanges` (the pages picked when the user chooses none) lands on the right start page for every text TOR in the set, or the miss is listed with its reason.
- [ ] Tests at the same seam as `test/soc-builds.test.ts` and `lib/soc-builder.test.ts`, using trimmed fixtures from the samples.

## Notes

- The samples are customers' real documents: keep copies under `.scratch/` only, never push the large PDFs (check `.gitignore` before adding fixtures; trim to the pages a test needs).
- The sample folder is outside the repo and is read-only for this work (do not write into it).
