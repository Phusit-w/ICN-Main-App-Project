# Scanned PDF SOC prototype — findings (2026-10-15)

Sample: USO 4 School (`C:\Phusit\socpdf\uso.pdf`), 85 scanned pages, 4 columns
(คุณลักษณะที่กำหนด / ข้อเสนอทางบริษัท / เอกสารอ้างอิง (หน้า) / หมายเหตุ).

Run: `node .scratch/soc-scanned-pdf/prototype/PROTOTYPE_grid.mjs <scan.pdf> <out-dir> [first-last]`
→ `page-NNN.png`, `cells-NNN.png` (the short-cells sheet), `index.html` (grid overlay).

## Step 1 — grid from ruled lines (no OCR)

- 85/85 pages → 4 columns, 838 rows (incl. one header row per page).
- Column line = vertical line from table top to table bottom **and** crossing the
  header row. Needed for pp.7/30: a table drawn inside a TOR cell has its own
  verticals; on p30 two inner tables line up into one long line.
- Row border = horizontal line crossing columns 2–4. Column 1 can break it
  (inner table border right next to it, p30) and holds rules under TOR lines (p2).
- Checked by eye: pp.2, 7, 21, 30, 49, 68 correct. Not every page checked.

## Step 2 — short-cells sheet for Claude

Per row: first line of column 1 (first 35% of width, holds the item number) +
offer + reference + remark cells, each cut to its ink; columns cut to the widest
ink on the page. Rows stacked, black bar between rows, gray bar between cells.

- Tokens (estimate w×h/750 after the 1568 px resize, not an API count):
  sheets **≈96k** for 85 pages (avg 1.1k, max 2.5k) vs full pages **≈197k** (2.3k each) → about −51%.
- The offer column is most of the cost: in this SOC it often repeats the TOR text.
- Read by Opus (this session): pp.3, 7, 21, 49, 68, 75 — every item number,
  offer and reference matched the original page. Sonnet (what the Runner uses) not tried.
- Scan problems solved: tilted row borders leak into cells (long dark runs > 40 px
  and thin bands ≤ 8 px at the cell edge are border, not text); rows are tight with
  text against the bottom border (p49), so margins are small; text touches the
  column line, so crop starts 5 px in but ink is looked for 14 px in.

## Open

- Column 1 is only the item number: the TOR text itself is not read. Fine if the TOR
  row comes from elsewhere (Image Row) — decide in the grill.
- Rows whose column 1 starts with an inner table (p7, p75) show the table's header
  instead of an item number.
- Real Runner run with Sonnet: accuracy + quota on 3–5 pages.
- Typhoon OCR question (see memory soc-scanned-pdf-prototype).

## Step 3 — Sonnet read (2026-10-15)

`claude -p --model sonnet` (Claude Code 2.1.300, headless like the Runner) read the
cells sheets of pp.3, 7, 21, 49, 68 and wrote rows.json (51 rows; it left out the
header rows).

- Checked against the page images (pp.3, 7, 49, 68 by eye): every item number,
  offer and reference matched, incl. references with page lists ("หน้าที่ 52, 110,
  113-114, 167-168, 208"). Rows without an item number (continuation text) gave "".
- p7 row 1 (inner table at the top of the TOR cell) → "?" — the known open case,
  but Sonnet said so instead of guessing.
- Usage: 7 turns, 59 s, input 107k cache-write + 191k cache-read, output 9.1k,
  list cost $0.54. Output is high because the task copied the full offer text;
  a real check would output verdicts, not a transcript.

## Step 4 — Typhoon OCR API (2026-10-15)

Key has typhoon-ocr-v1.5, typhoon-ocr (same output as v1.5), typhoon-ocr-preview.
Script: `PROTOTYPE_typhoon.mjs` (key file via TYPHOON_KEY_FILE; whole pages, or
`ROWS_DIR=` one row image per call from `ROW_PNGS=1 PROTOTYPE_grid.mjs`).

- Whole page, v1.5, pp.3/7/21/49/68: 12–45 s a page, ~2.3k in + 1.2–2.4k out tokens.
  Clean rows (p49, p68) mostly right, but:
  - structure: p21 three items (๔.๔.๑–๔.๔.๓) merged into one row; heading rows
    (๒., ๓., ๔., ๕.) lose their offer cell; p7 inner table read as made-up item names
    and the outer row put outside the table.
  - Thai text: "ยืนดี" for ยินดี on every row of pp.3/21, "การทำลายแล้ว" for
    "การชำระภาษีแล้ว", "สัญญาเตียง", "ทำนักงาน" in a reference.
- preview model: headings/rows better on pp.3/21, still "ด้อย/ด้วย" for ต้อง, "นโยบาย" for นิยาม.
- One row per call (our grid): much worse — made-up tables ("Samsung S7", "John Doe"),
  wrong item numbers, column labels echoed, empty answers, one 408 timeout.

Verdict: not reliable enough for SOC text (meaning-changing misreads, made-up content).
Sonnet on the cells sheet read the same pages with no errors.

## Step 5 — Pro quota for a full transcription, 10 pages (2026-10-15)

`PROTOTYPE_sonnet_full.sh` on FULL_TOR=1 sheets pp.1–10 (58 rows), one `claude -p --model sonnet`:
- quota 40% → 49% = **9 points for 10 pages** (incl. a little of the chat session) →
  ≈ 75 points for the 85-page USO file, i.e. most of one 5-hour window.
- 140 s, 12 turns, output 24.8k, cache read 316k, cache write 23.6k ($0.37 list).
- Accuracy: no "?"; p3 full TOR text exact (incl. the words Typhoon got wrong);
  p7 inner table transcribed correctly as "col | col / ..." lines. Heading item_no
  came as "๒" for "๒." (server rule can fix).
- Cost drivers: output (offer often repeats the TOR text) and 12 turns each
  re-reading the context.

## Step 6 — Typhoon one cell per call (2026-10-15)

Our grid cuts each cell with ink (`CELL_PNGS=1`, 300 DPI, 2 px inset, white pad);
`CELLS_DIR=... PROTOTYPE_typhoon.mjs`: model `typhoon-ocr` (= OCR 1.5, the docs'
recommended endpoint) with Typhoon's own v1.5 prompt from the typhoon-ocr 0.4.1
package, repetition_penalty 1.1. pp.1–10, 49, 68 = 237 cells, compared with Sonnet
(full transcription pp.1–10, short cells pp.49/68), after a cleanup (drop
<figure>…</figure>, lone "---", html tags; – → -):

- 181 comparable cells, 171 identical.
- Typhoon right, Sonnet wrong (checked on the image): 002-01 "ดำเนินการ" (S "ดำเนิน"),
  008-02 "จัดหาที่" (S "จัดหามาที่"), 068-01 "ประมวลคำ" (S "ประมวลค่า"),
  007-02 "คณสมบัติ" as printed (S corrected it).
- Typhoon wrong: 003-06 "จัดซื้อซื้อจัดจ้าง" (word doubled), 007-01 inner table
  "ชุดคู่เก็บ" for ชุดตู้เก็บ; cosmetic: "R๒" → "R2", printed typo "ป้องการ" → "ป้องกัน".
- 2 offer cells (pp.1, 2: one short line in a tall cell) were never sent: the grid's
  ink threshold 0.004 called them empty — fix in the grid, not Typhoon.
- Empty remark cells with border ink come back as "---" or a <figure> describing lines.
- Inner table (p7) comes back as an HTML table, correct apart from one word.

So per cell Typhoon ≈ Sonnet accuracy, no Pro quota. Cost: 237 calls, ~113k prompt
+ ~15k completion tokens. Limit (docs.opentyphoon.ai/en/ocr): 2 req/s, **20 req/min**
→ the 85-page USO (~2,000 cells) ≈ 100 min per file at the free limit. Pricing and
data retention not stated in the docs.

## Step 7 — faster Typhoon? (2026-10-15)

Typhoon free limit 20 req/min; no higher limit available to us.
- Skip empty cells (only ruled-line ink): 2,355 → 1,991 cells for USO = ~99 min.
- Skip near-duplicate cells (`PROTOTYPE_dedupe.mjs`): only 4 found — scans of the same
  text differ too much; a looser threshold would merge "ข้อ 9" with "ข้อ 8". Dropped.
- Several cells in one image (`PROTOTYPE_pack.mjs`, one-column ruled table):
  Typhoon answers paragraphs, not a table. Split by blank line: max height 2000 px →
  28/31 packs split (176/213 cells), but text dropped or mixed between cells;
  1000 px → 50/62 packs. Printed "### n ###" labels (LABELS=1): worse, 13/31 packs,
  and 1,919 s (many 429/timeouts). Packing is not reliable enough.
Next candidate: Google Cloud Vision DOCUMENT_TEXT_DETECTION per page (1,000 pages/month
free), words placed into our grid cells by their boxes.
