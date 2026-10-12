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

**Status:** ready-for-agent

- [ ] Packet built from a test `.docx` with Image Rows lists the image files; reference inheritance and its note are tested
- [ ] The Read check fails when an image file was not opened (test)
- [ ] Results expansion handles the three kinds; a picture row has no verdict (tests)
- [ ] A `claude -p` Sonnet run on one MEA Y69 major item that has Image Rows (short work folder) ends with valid results: every image Read, every Image Row has a kind
- [ ] The kinds agree with the prototype's for the same images, or each difference is explained in Comments
- [ ] Token use of that run, and of a similar-sized major item without images, is noted in Comments
- [ ] Existing skill tests pass

## Comments

**2026-10-12, from ticket 03:** see "Found on the way" in `../README.md`: MEA rows have 6 to 8 cells and the reference is at grid column 9, so `reference_columns` must work by grid column; and MEA's major items restart per ผนวก.
