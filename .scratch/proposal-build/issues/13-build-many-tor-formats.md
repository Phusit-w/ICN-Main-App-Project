# 13: สร้าง SOC รองรับ TOR หลายรูปแบบ (จากตัวอย่างจริง)

**What to build:** Make สร้าง SOC (ticket 05 and the older build, `lib/soc-builder.ts`, `lib/soc-builds.ts`) produce a draft that matches the SOC people really wrote, across the TOR and SOC pairs in `Example SOC+TOR+Datasheet/TOR+SOC` (5 customers). Work in rounds: build a draft from each sample TOR, compare it row by row with the real SOC, group the differences into cases, fix one case group at a time with a test that uses the sample. Raised by the user 2026-10-30 ("มีหลายเคสมากเลย ควรทำแยกเป็นอีก ticket").

**Blocked by:** 05 (done). Not blocked by 12: scanned-TOR cases that need Claude reading are listed here but wait for 12.

**Status:** ready-for-agent (first step = the comparison run below; the case groups and acceptance numbers are decided after it, not before)

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
