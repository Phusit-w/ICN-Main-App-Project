# 06: The web recognises Image Rows

**What to build:** After uploading a Word SOC with images in the TOR column, the reviewer sees each Image Row on the review page with its image where the TOR text would be, before any reading exists.

- An Image Row is a table row whose TOR cell has a drawing and no text. It belongs to the numbered row above it and counts as a row of that major item (progress and the 60-row split).
- The image is served from the stored SOC file through an authorised route, for people who may see the job. Images are not copied into the database.
- The results Excel writes `[รูป]` in the TOR column of an Image Row.
- A SOC without images behaves exactly as before.

Spec: `../spec.md`, "Image Rows". Glossary: Image Row.

**Blocked by:** 01

**Status:** done

- [x] Tests build a Word SOC with an image-only TOR cell: the reader marks the row, the major item's row count includes it
- [x] The review page shows the image for that row; a user without access to the job cannot fetch it (tests)
- [x] The results Excel has `[รูป]` for the row (test)
- [x] Checked in a browser with the MEA Y69 sample saved as `.docx`: 19 Image Rows show their images
- [x] lint, typecheck, `npm test` and build pass (one test was already failing, see Comments)

## Comments

**2026-10-12: done.**

- Reader (`lib/soc-table.ts`): a Word row whose TOR cell (the second) has an embedded image and no text is an Image Row. Both ways Word stores it are read: `w:drawing` / `a:blip r:embed`, and the VML of a `.doc` saved as `.docx` (`w:pict` / `v:imagedata r:id`), which is what MEA Y69 has. `rowText(row, item)` returns `image: true`; new `rowImage(row, item)` returns `{ name, data, mimeType }` read from the SOC file on demand (`mimeType` is null for a kind a browser can't show, such as .emf). Row counts needed no change: an unnumbered row already counts under the numbered row above it.
- In a SOC of several tables, a row with no number is now found under its own numbered row (before, the lookup could fall back to the parent row's text).
- Route: `GET /api/soc/jobs/[id]/soc-rows/[row]/image?item=<item>`, behind `authorizeSocJob`. 404 when the row isn't an Image Row, 415 for a kind a browser can't show. Nothing is copied into the database; no migration.
- Review page: `SocReviewRow.torImage`; the table shows a "รูป" chip, the inspector shows the image where the TOR text would be (a click opens it full size). Results Excel: `[รูป]` in the TOR column.
- Tests: `lib/soc-table.test.ts` (reader), new `test/soc-image-rows.test.ts` (row count, review view, route and access, Excel), one test in `test/soc-review-workspace.test.ts` (panel). `test/docx-fixture.ts` builds a SOC with image cells.
- Browser check (a second dev server on port 3100, pilot-db): MEA Y69 saved as `.docx`, job "MEA Y69 (ticket 06 browser check)" with made-up results for the 19 Image Rows and their parent rows. 19 rows carry the chip and all 19 images load. The job is still in the local pilot-db; its results are placeholders, not a real check.
- Validation: lint, typecheck and build pass. `npm test`: 253 of 254 pass; the one failure is the filter test in `test/soc-review-workspace.test.ts`, failing since before ticket 01.
- /code-review done; fixed: "image" instead of "picture" in code and comments (a picture is one kind of Image Row), `../` and root-relative image targets, the several-tables lookup, an access test for another user's own job, one shared helper for the image failure reason.

Not handled, by choice:

- Only the first image of a TOR cell is shown.
- Not an Image Row: a linked image (not embedded), an image inside a nested table, a drawing whose text box has text, and a shape with no embedded image (lines or boxes drawn in Word).

For 07 and 08:

- 07: MEA's images are VML (`v:imagedata r:id`), not `a:blip`. The 19 Image Rows are table rows 92, 111, 127, 146, 203, 223, 232, 242, 251, 261, 274, 284, 297, 335, 338, 339, 349, 359, 383, all PNG. A result row for an Image Row must carry the item number of the numbered row above it (the web's import rejects a row without an item number).
- 08: `torImage` is derived only when the stored `socText` is empty. If the Image Reading is stored in `socText`, the image disappears; store the reading in its own field, or take `torImage` from the SOC whatever `socText` holds. The Excel cell is `[รูป]` alone today; 08 appends the reading. The job page does not yet say how many Image Rows a major item has; the runner-version rule in 08 needs that count (the reader knows it per row, nothing is stored).
