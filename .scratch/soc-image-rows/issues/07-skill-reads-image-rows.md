# 07: The skill reads Image Rows

**What to build:** A Local Check Run on a major item with Image Rows sorts every image into a kind, reads what can be read, and checks it.

- The skill extracts each Image Row's image to a file in the run's work folder and names it in the Evidence Packet for that row. Claude must open it with Read; the "every page was Read" check also fails when an image file was not opened.
- Per Image Row the results carry: the kind (`text_image`, `picture`, `mixed_image`), the Image Reading, and what Claude was unsure of.
- Reading rules (from the accepted prototype prompt, `../prototype/PROTOTYPE_read_image_rows.py`): text exactly as printed, in its own language; numbers and units unchanged; one line per printed line; table rows as "label: value"; `[?]` for anything unreadable, never a guess; a short caption alone does not make a picture a text image.
- `text_image`: judged by the existing rules with the Image Reading as the TOR text. `mixed_image`: the same, plus a fixed note that the drawing was not compared. `picture`: no verdict fields.
- An Image Row with an empty reference cell gets the reference of its numbered parent row from the script, with a fixed note naming the parent item ("ใช้อ้างอิงของข้อ X"), before candidate files and pages are chosen.
- A major item with no Image Rows takes exactly today's path and reads nothing extra.

Skill work, outside this repo. Do not upload a Skill Package (ticket 09 does).

**Blocked by:** 02

**Status:** done (2026-10-12)

- [x] Packet built from a test `.docx` with Image Rows lists the image files; reference inheritance and its note are tested
- [x] The Read check fails when an image file was not opened (test)
- [x] Results expansion handles the three kinds; a picture row has no verdict (tests)
- [x] A `claude -p` Sonnet run on one MEA Y69 major item that has Image Rows (short work folder) ends with valid results: every image Read, every Image Row has a kind
- [x] The kinds agree with the prototype's for the same images, or each difference is explained in Comments
- [x] Token use of that run, and of a similar-sized major item without images, is noted in Comments
- [x] Existing skill tests pass

## Comments

**Live runs (2026-10-12, Sonnet, `run_mea.py`, outputs in `../fixtures/07-image-run/r25`, `r17`, `r112`):** all three ended with valid results, every packet row has a result row, `check_page_reads` exit 0 (`images_not_read` empty), validator exit 0 (1.7 has no evidence file, so no validator).

- 2.5 (8 rows, Image Row 111): `mixed_image`, same as the prototype. The reading has the note text, the caption and the dimensions 290 / 20 mm; the two small slanted numbers are `[?]` and named in `image_unsure` (no guess). Fixed `image_note` present; verdict `unverifiable`, confidence low ("±2% not in the Datasheet, compare Figure 1 by eye").
- 1.7 (2 rows, Image Row 92): `picture`, same as the prototype. Reading = the caption only; no verdict fields. No reference at all, as noted below.
- 1.12 (8 rows, no Image Row): today's path; job.md has no image section.

| run | rows | pages | packet image tokens (rough) | seconds | turns | output | cache write | cache read | cost USD |
|---|---|---|---|---|---|---|---|---|---|
| 2.5 (image) | 8 | 3 | 514 | 136 | 22 | 19,407 | 95,397 | 913,449 | 0.67 |
| 1.12 (no image) | 8 | 2 | 84 | 127 | 25 | 13,784 | 71,548 | 1,191,267 | 0.54 |
| 1.7 (picture) | 2 | 0 | 247 | 50 | 17 | 4,562 | 58,475 | 646,430 | 0.34 |

**/code-review (2026-10-12)**, skill diff against `C:/Phusit/soc07/skill-before`: no hard violations. Fixed: a `.webp` Image Row made the size summary stop the build after the packet was written (MuPDF can't open .webp; Read can) → the summary skips an image it can't measure; test added, 161 pass. Left, for later tickets:

- Image Rows need the packet flow. Without a packet, SKILL.md's old rule ("แถวรูป = reference `match`, evidence `not_applicable`") still applies and gives no `image_kind`, which the web would reject. The Runner always builds the packet, so only a hand-run without packet hits this.
- Ticket 08: check that the web import accepts a picture row with no `reference_check`/`tor_decision` at all (the 1.7 results.json in `r17/` is a real one to try).
- Reference inheritance is proven by tests only (no MEA Image Row borrows one).
- Judgement calls not taken: the image kind is a bare string in three scripts and the web; the "is an Image Row" test is spelled three ways.

2.5 costs about +24% over 1.12 (+41% output, +33% cache write), but it also has one more evidence page and a mixed image to read and judge, so not all of it is the image. Single runs; quota per item is ticket 09's job.

**Earlier RESUME (2026-10-12, paused by the user mid-ticket; the live runs are now done, see above):** code and tests are written, the live runs are not done.

Done, skill only (outside git, no package built):

- `soc_table.py`: `SocImage`, `SocCell.image`, `SocRow.image` (the web's rule: TOR cell with an embedded image and no text; `a:blip` and VML `v:imagedata`; not in a nested table).
- `build_evidence_packet.py`: the reference is found by grid column, not cell position (MEA); an Image Row's image goes to `out/packet/images/row<N>.<ext>` (`image_file`; `.bmp`/`.tif` stored as PNG; `image_error` when it can't be opened); an Image Row with no reference takes the one of the numbered row above, `reference_note` "ใช้อ้างอิงของข้อ X"; job.md names the images only when the item has Image Rows.
- `check_page_reads.py`: `images_not_read`, exit 2. `expand_results.py`: `image_kind`, `image_reading`, `image_unsure`, fixed `image_note` for a mixed image, `reference_note`; a picture keeps no verdict field. `append_results_to_docx.py`: a picture row needs no verdict ("รูปที่ต้องดูเอง"), a read image starts its key issue with "อ่านจากรูป".
- New `references/image-rows.md` (read only when job.md says the item has Image Rows); one table row in SKILL.md, one line in evidence-packet.md.
- Skill tests: 160 pass (138 before). Packets of items without images are byte-identical before and after: MOF_RFID ๕.๕, ๕.๘, ๕.๑, ๕.๒ and Surat 2.2, 2.1, 1.1 (copy of the skill before the change: `C:/Phusit/soc07/skill-before`).

Left to do then (done 2026-10-12):

1. Live Sonnet runs from a new short folder each: `python run_mea.py C:/Phusit/soc07/r25 --item 2.5` (8 rows, Image Row 111, prototype kind: mixed_image), `--item 1.7` (2 rows, Image Row 92, prototype: picture, no reference at all) and `--item 1.12` (8 rows, no image, for the token comparison). The 2.5 packet was built and looks right (`C:/Phusit/soc07/p25/out/packet/job.md`); no Claude run was started.
2. Fill in the acceptance boxes and the token numbers here; `/code-review`; commit the fixture and ticket notes; update the board and the memory file.

Found on the way, for the README and ticket 09:

- MEA has no proposal column: ข้อกำหนด | Compliance | Non-Compliance | เลขอ้างอิง | Remark (the column names are in the page header, not the table). The third cell is the Compliance tick, so "ข้อเสนอ" is empty on every row and the ticks of 6-cell rows are not reported (the builder skips a row's first three cells).
- Because item numbers restart per ผนวก, the skill reaches only the first run of each number: of the 19 Image Rows only rows 92 (1.7), 111 (2.5) and 274 (11.) are in a major item it can build. Item 2.5 also runs on into ผนวก 10 (rows 112 to 117).
- No MEA Image Row borrows a reference (rows 92 and 127 have none, and neither has their numbered row): inheritance is covered by tests only.
- Not handled: `.emf`/`.wmf` images (named as unreadable, the row becomes a picture); Image Rows in the old flow without a packet.

**2026-10-12, from ticket 03:** see "Found on the way" in `../README.md`: MEA rows have 6 to 8 cells and the reference is at grid column 9, so `reference_columns` must work by grid column; and MEA's major items restart per ผนวก.
