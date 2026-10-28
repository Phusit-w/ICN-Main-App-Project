# 02: Measure split accuracy on MEA, MOF, Apron

**What to build:** A dev script (not shipped, not CI) that builds a SOC from the MEA (text), MOF and Apron (scanned, using the cached OCR text from TOR Match) TORs and compares with their real SOCs: rows, item numbers, text. Record the numbers in Comments. Use the 2-3 sample SOC Templates the user sends. If the splitter is weak on scanned TORs, stop and revisit before any UI work (spec Further Notes).

**Blocked by:** 01

**Status:** done 2026-10-28 (GO, with the notes below)

- [x] Numbers per set (rows matched, item numbers matched, text exact / format-only / different) recorded in Comments
- [x] Go / no-go note for the UI tickets
- [x] Samples copied to a short folder (MAX_PATH), outside git: `C:\Phusit\soc-builder-samples\` (real SOC + the three drafts)

## Comments

Script: `.scratch/soc-builder/dev/measure-split.ts` (`node --import ./test/register.mjs .scratch/soc-builder/dev/measure-split.ts [mea|mof|apron]`, `DETAIL=1` lists missing / extra rows). The real SOC is the reference; the TOR is read as TOR Match reads it (MEA `readTextTor`, MOF / Apron cached Typhoon text through `scannedTorPages`). **Template: a synthetic one** (fixture header + one blank row), because the user's sample templates have not arrived; only the table is measured, not formatting.

"Item rows" = the real SOC rows the builder is meant to make: dotted items, ผนวก headings, major-item headings, and in a ผนวก SOC every "N." row. Sub-lists "(1)", "1)" and list rows inside an item are folded into the parent row by design (spec decision 6), so the real SOC's rows for them (MOF has 265 of its 313) are not counted.

| | MEA Y69 (text, TOR p.123-149) | MOF RFID (scanned, p.1-18) | Apron (scanned, p.13-39) |
|---|---|---|---|
| real item rows | 234 | 48 | 306 |
| built rows | 189 | 55 | 306 |
| item numbers matched (of real / of built) | 189 = 80.8% / 100% | 48 = 100% / 87% | 306 = 100% / 100% |
| text exact | 126 | 23 | 126 |
| text format-only | 14 | 1 | 148 |
| text contained (draft ⊇ real) | 45 | 23 | 8 |
| text different | 4 | 1 | 24 |

After the first run two splitter fixes went in (tests added): under a ผนวก, "N." is an item when it restarts at 1 or follows the last number (MEA numbers 1. 2. 3. again under every unnumbered sub-heading: 57% → 81%); a dotted number counts only in the current major item or the next one ("34.8 มิลลิเมตร" no longer becomes an item).

What is left, none of it a splitter fault:
- **MEA, 45 real rows missing**: rows on the TOR's picture pages (ผนวก 14, 16: cable data sheets drawn as pictures, 29 rows per the TOR Match findings) and sub-heading rows the real SOC numbers but the TOR does not ("Requirements", "Dimension" in ผนวก 13). The draft warns on the picture pages.
- **"contained"** = the real SOC puts an unnumbered sub-line ("ส่วนที่คงที่ : …", "ส่วน Splicing : …") in its own unnumbered row; the draft keeps it in the parent row (spec decision 6). The text is all there. MEA 45, MOF 23, Apron 8.
- **"different"** = OCR misreads in the scanned TORs (Apron IP66 → "IPvs", ซอฟต์แวร์ → ซอฟแวร์, 120 → ๑๒๐ …); MEA 4 are a wrong-looking TOR text ("สัญญาลักษณ์") vs the SOC's fix, and one item whose neighbouring sub-heading line was folded in. This is the Beta / "ทวนทุกข้อเทียบ TOR จริง" case, and what the AI proofread (ticket 08) is for.
- **MOF, 7 extra rows (ข้อ ๖-๑๒)**: the TOR's non-spec sections, because the test took pages 1-18; the user picks the page range in the real flow.
- Pages before the first item (cover, ข้อ preamble) give the "ข้อความก่อนข้อแรก" warning on MOF and Apron, as intended.

Round trip held on all three (the SOC reader reads the draft back with the same items and major items); each build takes under 60 ms.

**Go.** Item numbers are found 81-100% (MEA's gap is pictures and unnumbered sub-headings), no row text is lost, scanned TORs are not weaker than the text one. Notes for later tickets: (1) warn on pictures stays important for ผนวก SOCs; (2) an unnumbered sub-heading folded into the previous item (MEA "โครงสร้างของ FDF" after item 3) is the one systematic oddity, left for the user's review of real drafts; (3) re-run on the user's real templates when they arrive.
