# 08: Image Rows end to end on the review page

**What to build:** Results from a run with Image Rows reach the web, and the reviewer works through them on the review page.

- Import validates the image fields: the kind is one of the three values, and an Image Row without a kind is rejected with a message naming the row.
- The review page shows, for an Image Row: the image, the kind label ("อ่านจากรูป" for text and mixed images, "รูปที่ต้องดูเอง" for a picture), the Image Reading (read-only), the unsure note, the "drawing not compared" note for a mixed image, and the borrowed-reference note when present.
- A Picture Row shows the image with the cited evidence page beside it and has no Claude verdict. Confirming the major item is blocked until every Picture Row in it has a Final Decision.
- Re-check of picked rows works for an Image Row.
- The results Excel writes `[รูป]` then the Image Reading.
- A Runner older than the new version does not take a Check Request for a major item that has Image Rows, and says why.
- Any schema change is additive; existing jobs and results are untouched.

Glossary: Image Reading, Picture Row.

**Blocked by:** 06, 07

**Status:** done

- [x] Import accepts valid image fields and rejects a bad or missing kind (tests)
- [x] Review page shows image, labels, reading and notes for each kind (tests)
- [x] A major item with an undecided Picture Row cannot be confirmed; it can once the row has a Final Decision (tests)
- [x] Results Excel shows `[รูป]` plus the reading (test)
- [x] An old Runner refuses the request (runner test)
- [x] A full local run on one MEA major item: request, Runner, import, review page checked in a browser
- [x] lint, typecheck, `npm test`, runner tests and build pass

## Comments

**DONE (2026-10-14):** validated again, reviewed (`/code-review`, Standards + Spec) and committed. Final round: typecheck, lint and build pass; `npm test` 265/265; runner tests 119. Tests ran on `test-db4` (port 51258): `test-db3` now hangs on start, as `test-db` did.

Changed after the review:

- A picture (no verdict) is refused when its row can't be found in the SOC; before, such a row imported with no verdict.
- A picture is always stored as a content row, so one the run calls a heading row still waits for a Final Decision.
- Review-page test for a text image added (only mixed and picture were covered).
- The old filter test in `test/soc-review-workspace.test.ts` (failing since ticket 01) now follows the page: the reset button "↺ ล้าง" shows only while a filter or sort is changed.
- Small: `PICTURE_ROW_REASON` reused in the panel, `runnerTooOldFor` returns the reason, `imageRows` in the claim example of `docs/SOC-RUNNER.md`.

Left as it is, for the user to decide (review findings):

- **Jobs uploaded before this deploy have `imageRowCount` 0** (no backfill: the count needs the SOC file). For those, an old Runner is still handed an item with Image Rows, and Runner 0.6.0 still falls back to the old flow when the packet can't be built; the import then refuses the run naming the Image Row. Fix if wanted: count again when a check is requested, or a one-off script at deploy.
- A results file that leaves an Image Row out imports cleanly (as for any left-out row), so that row never blocks confirming.
- "An old Runner refuses the request" rests on ticket 05's version test (`needsRunner`), which is not tied to 0.6.0; the server side (old Runner is handed nothing) has its own test here.
- Beyond the ticket's words: the import also refuses a kind on a text row and a read image without `image_reading`; Runner 0.6.0 fails an Image Row item when the packet can't be built.

**RESUME (2026-10-12, paused by the user before review and commit):** code, tests and the full local run are done; NOTHING is committed. Left, in order:

1. Read the result of the last validation round (typecheck, lint, `npm test`, runner tests, build) or run it again. Before the last two small panel edits: typecheck, lint and build passed; `npm test` 262/263 (only the old filter test in `test/soc-review-workspace.test.ts` fails, as since ticket 01); runner tests 119 pass. One run had "ตรวจทั้งชุด queues every unchecked major item…" fail once; it passed alone and in the next full run (looks intermittent).
2. `/code-review` (Standards + Spec) on the uncommitted diff below; fix what's real.
3. Tick the boxes above, write the done note here, update the board (`../README.md`) and memory; commit ONLY these files (the repo has other WIP, never `git add -A`). After `next dev` on :3100, `git checkout tsconfig.json`.

Files of this ticket: `prisma/schema.prisma`, `prisma/migrations/20261012180000_soc_image_rows/` (new), `lib/soc-shared.ts`, `lib/soc-major-items.ts`, `lib/soc-table.ts`, `lib/soc-import.ts`, `lib/soc-review.ts`, `lib/soc-review-view.ts`, `lib/soc-results-excel.ts`, `lib/soc-check-requests.ts`, `components/SocReviewPanel.tsx`, `soc-runner/runner.py`, `soc-runner/test_runner.py`, `docs/SOC-RUNNER.md`, tests `test/soc-image-rows.test.ts`, `test/soc-excel-soc.test.ts`, `test/soc-review-workspace.test.ts`, `lib/soc-major-items.test.ts`, harness `../fixtures/08-local-run/` (setup08.ts, browse08.mjs). NOT this ticket: `docs/SOC-DOMAIN-GLOSSARY.md`, `.scratch/soc-reviewer-run-check/*` (older WIP).

What was built:

- Migration (additive): `SocMajorItem.imageRowCount` (counted at upload; 0 on older jobs), `SocCheckResult.imageKind/imageReading/imageUnsure/referenceNote`. Applied to the local pilot-db (schema diff empty).
- Import: an Image Row (by the SOC reader) must have `image_kind`; a kind on a text row, an unknown kind, or a read image without `image_reading` is refused naming the row; a `picture` needs only row + item (no verdict fields).
- Review: a picture is ⚠️ "รูปที่ต้องดูเอง: Claude ไม่ตัดสินแถวนี้", never ✅; the panel shows the kind label, the reading (read-only), unsure note, the mixed-image note, the borrowed-reference note in the evidence pane; a picture hides the verdict and axes. The table shows the reading after the "รูป" chip. Confirm gate needed no new code (an undecided row already blocks it).
- Excel: `[รูป]` + newline + the reading.
- Runner **0.6.0** (`SOC_RUNNER_FOR_IMAGE_ROWS`): the server hands an item with Image Rows only to 0.6.0+ (`runnerTooOld: "image_rows"`, job page says why; `runnerTooOld` is now a reason, "excel_soc" for ticket 05's case); the request carries `imageRows`; 0.6.0 fails such an item instead of running the old flow when the packet can't be built.

Full local run (2026-10-12): a throwaway DB `soc08-db` (pilot-db takes one connection, held by the :3000 dev server), :3100 dev server, skill source uploaded there as `2026-10-12-images-local`, MEA Y69 job, runner 0.6.0 from source (`C:/Phusit/soc08`). Requested 1.7 and 2.5 in Edge (playwright-core): both claimed, submitted (2 and 8 rows) and imported. Review page: row 92 picture and row 111 mixed_image show as designed (screenshots `C:/Phusit/soc08/shots`); 1.7 drops from ยืนยันแล้ว to ตรวจแล้ว when only the picture row is รอแก้ไข and comes back when it is ผ่าน; Excel cells checked. One HTTP 500 on claim came from the dev server recompiling mid-request (not the app).

For 09 / later: the web's MEA items merge both runs of a restarted number (1.7 = 4 rows, 2 Image Rows), while the skill builds only the first run (still the open MEA decision). Deploy order unchanged: skill package with Image Rows first, then server (1 migration), then reviewers re-install Runner 0.6.0.
