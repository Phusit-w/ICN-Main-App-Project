# Spec: Scanned PDF SOCs

Status: ready-for-agent

Grilled 2026-10-15 and 2026-10-16. Vocabulary is in `docs/SOC-DOMAIN-GLOSSARY.md` (Scanned PDF SOC, PDF SOC, Excel SOC, Image Row). The main decision is ADR 0010 (a scanned PDF SOC is read by Typhoon OCR in the background, on the server), which builds on ADR 0009 (a PDF SOC becomes an Excel SOC on upload). Checks still run on the reviewer's machine (ADR 0008). Measurements and prototype scripts are in `.scratch/soc-scanned-pdf/prototype/FINDINGS.md`.

## Problem Statement

A reviewer receives a bid SOC as a PDF made of scanned images, for example USO 4 School: 85 pages, 4 columns, about 838 rows. Today the upload is refused, so the reviewer must retype the table into Excel by hand before any check can run. Reading it with Claude on the Runner works but costs about 75 Pro quota points per file, and local OCR on the server was too slow and too inaccurate.

## Solution

The reviewer uploads the scanned PDF as it is. After a confirmation that the file goes to an external OCR service, the job appears at once with the status "กำลังอ่านตาราง" and a progress count. The server cuts each table page into cells along the ruled lines and reads every cell with the Typhoon OCR API in the background. This takes about 62 minutes for 85 pages (measured 2026-10-16, see ADR 0010) and costs no Claude quota. While the read is still running, each major item whose rows are all read can already be checked, so a reviewer can start within minutes. When the read finishes the job becomes an ordinary Excel SOC: every major item is made, all check buttons turn on, and the review page can open the source page of each row. The reviewer can leave the page, and a restart or deploy of the server does not lose the work.

## User Stories

1. As a reviewer, I want to upload a scanned PDF SOC as it is, so that I do not retype the table into Excel.
2. As a reviewer, I want to be told before upload that the file will be sent to an external OCR service, so that I decide knowingly each time.
3. As a reviewer, I want to cancel at that notice, so that nothing is uploaded or sent if I change my mind.
4. As a reviewer, I want the job to exist at once with the status "กำลังอ่านตาราง", so that I can see it was accepted and leave the page.
5. As a reviewer, I want to see read progress (cells or pages done of total), so that I know whether to wait or come back later.
6. As a reviewer, I want the check button of a major item to stay off until every row of that item has been read, so that I never check a half-read item. (Superseded the original "off until the whole file is read"; see ticket 12 and ADR 0010 amendment.)
6a. As a reviewer, I want a major item to become checkable as soon as its rows are read while the rest of the file is still reading, so that I can start working within minutes instead of waiting for the whole file.
7. As a reviewer, I want the job to become a normal Excel SOC when the read finishes, so that major items, checks, review page and results Excel work as for any other SOC.
8. As a reviewer, I want a second scanned job to wait with "รอคิวที่ N", so that I know it is queued and not stuck.
9. As a reviewer, I want queued jobs to start in upload order, so that waiting is fair.
10. As a reviewer, I want to cancel a job that is reading or queued, so that Typhoon calls stop at once and the shared limit is not wasted.
11. As a reviewer, I want to delete a job that is reading or queued, so that I can get rid of a wrong upload.
12. As a reviewer, I want cells already read to be kept after a cancel, so that I can resume instead of starting over.
13. As a reviewer, I want cells to be deleted from disk when the job is deleted for good, so that bid data does not stay behind.
14. As a reviewer, I want the read to continue after the server restarts or is deployed, so that a 100-minute read is not lost.
15. As a reviewer, I want failed Typhoon calls to retry with a delay on their own, so that a short outage does not fail the job.
16. As a reviewer, I want a job whose calls keep failing to show "อ่านตารางไม่สำเร็จ" with a resume button, so that I can continue later without losing cells already read.
17. As a reviewer, I want no partial `.xlsx` to be made silently, so that I never check a table with missing rows without knowing.
18. As a reviewer, I want a warning for gaps or duplicates in item numbers, so that I notice misread or missing rows.
19. As a reviewer, I want a warning for rows whose TOR cell came out empty, so that I notice cells the reader could not read.
20. As a reviewer, I want a warning for doubled words in a cell, so that I notice OCR repetition.
21. As a reviewer, I want a table drawn inside a TOR cell kept as multi-line text in that cell, so that item ๑ stays one row in the SOC.
22. As a reviewer, I want a TOR cell that is only a picture to become an Image Row, so that the existing picture handling applies.
23. As a reviewer, I want a page whose grid cannot be cut to be skipped and named in a warning, so that I know exactly which pages are missing.
24. As a reviewer, I want a file refused when more than half of its table pages cannot be cut, so that a useless job is not made.
25. As a reviewer, I want a mixed PDF read per page, so that text pages stay fast, exact and free and only scan pages go to OCR.
26. As a reviewer, I want a PDF with no scanned table page never to show the external-OCR notice or call Typhoon, so that ordinary PDF SOCs are unchanged.
27. As a reviewer, I want each row to remember its source page, so that the review page opens the original scan next to the row.
28. As a reviewer, I want the item number read from the start of the TOR text when the table has no item column, so that scanned SOCs like USO 4 School work.
29. As a reviewer, I want a clear message when the OCR service is not set up, so that I know to ask the admin and not retry.
30. As an admin, I want one shared `TYPHOON_API_KEY` in the server `.env`, so that no reviewer needs their own key.
31. As an admin, I want a scanned PDF refused as today when the key is missing, so that nothing is promised that cannot be done.
32. As an admin, I want one shared pace for all users, kept below what Typhoon accepts and set in configuration (default 30 calls per minute, the measured tolerance; the documented limit is 20), so that the shared key is not blocked and the pace can be lowered without a deploy.
33. As an admin, I want a job stuck in reading to be visible and cancellable, so that one bad file does not block the queue.
34. As an admin, I want no new Skill Package or Runner version, so that reviewers do not have to re-paste the install command.

## Implementation Decisions

- **Reading pipeline.** Reading a scanned table page has two steps. First the server finds the ruled lines and cuts the page into cells with no OCR. The grid cutter is ported from the prototype, which handles slightly rotated scans by tracing lines in short chunks and chaining them, and which makes the column lines cross the header row so that a table drawn inside a TOR cell does not add columns. It needs a lower ink threshold than the prototype, because two short cells were called empty. Second, each cell image is sent to the Typhoon OCR API (model `typhoon-ocr`, the v1.5 prompt from the prototype), one cell per call.
- **Ruled tables only.** Tables without ruled lines are out of scope. A page where no usable grid is found counts as a page that cannot be cut.
- **PDF SOC converter.** The existing converter stays the one place that turns PDF bytes into rows, row pages and warnings. It is extended so that, per page, a text page uses the existing reader and a scanned page uses the scan reader. Rows are merged in page order and then follow the same rules as a text PDF SOC: header names the Excel reader recognises, item number from the start of the TOR text when there is no item column, a row cut across a page break stays two rows. A PDF with no scanned table page behaves exactly as today.
- **Cell reader seam.** The scan reader gets the cell reader as an injected dependency. Production wires it to Typhoon; tests pass a fake. This is the only new seam.
- **Background read job.** A scanned PDF upload creates the job at once in a new status "กำลังอ่านตาราง" with progress. The work runs inside the existing web process, not a separate worker. Every cell result is saved to disk as soon as it is read, so a restart or deploy resumes from the saved cells. When all cells are done the converter output is written beside the original PDF as the generated `.xlsx`, the major items are made, the status leaves "กำลังอ่านตาราง", and the check buttons turn on.
- **Queue.** One scanned job is read at a time, in upload order, because the Typhoon rate is shared and parallel jobs would not be faster (measured: 2 and 4 parallel calls both give about 32 cells per minute). A job waiting shows "รอคิวที่ N". The reader paces calls at a configurable rate (default 30 per minute; Typhoon documents 20) and treats a rate-limit answer as a retry with backoff, so if Typhoon starts enforcing 20 the read slows to about 99 minutes but does not fail.
- **Retry and failure.** Failed calls retry automatically with a delay. When they keep failing the job becomes "อ่านตารางไม่สำเร็จ" with a resume button that continues from the saved cells. No partial `.xlsx` is ever produced.
- **Cancel and delete.** Cancel or delete of a reading or queued job stops Typhoon calls at once. Cancel keeps the saved cells so the read can resume. Deleting the job for good (including the existing trash purge) removes the saved cells.
- **Cell content rules.** A table inside a TOR cell becomes multi-line text in the same cell. If Typhoon answers a cell with only a figure, that row is an Image Row, as in the Excel image-rows work. Thai numerals and text are kept as read.
- **Page failure rule.** A page whose grid cannot be cut is skipped and named in the job warnings. If more than half of the table pages cannot be cut, the file is refused.
- **Quality warnings.** No per-row human confirmation. After the read the job warns about item-number gaps and duplicates, empty TOR cells and doubled words. The review page opens the source page, reusing the page-view feature already built for text PDF SOCs, extended to show a scanned page as an image.
- **Upload confirmation.** The upload screen must show "ไฟล์นี้จะส่งไป OCR ภายนอก" and require an explicit confirm each time, only when the file has at least one scanned table page. Detecting that happens before the confirm, without OCR.
- **Configuration.** One shared `TYPHOON_API_KEY` in the server `.env`. With no key a scanned PDF is refused with the current message, and the message tells the user to ask the admin. The earlier leaked key must be rotated before the shared key is set.
- **Status model.** "กำลังอ่านตาราง", "รอคิวที่ N" and "อ่านตารางไม่สำเร็จ" are states of an Excel SOC job that is not ready yet; every screen that enables checks, major items or exports must treat a not-ready job as having no rows. A schema change is needed for the read state and progress; it must be additive and safe to apply on the production database.
- **No Runner or skill change.** Everything downstream of the generated `.xlsx` is untouched, so no new Skill Package and no new Runner version.
- **Docs.** ADR 0010 and the glossary entry for Scanned PDF SOC are already written. The glossary may need a term for the not-ready read state.

## Testing Decisions

- A good test checks external behaviour only: what rows, pages, warnings, statuses and files come out for given inputs. It does not test line-to-cell geometry or call Typhoon.
- **Seam 1: PDF converter with a fake cell reader.** Small PDFs built in the tests: a scanned table page, a table with a table inside a TOR cell, a figure-only cell, a page with no usable grid, a mixed text and scan PDF. Assert rows, row pages, item numbers, warnings, the refuse-when-more-than-half rule, and that an all-text PDF never calls the cell reader.
- **Seam 2: background read job with the same fake.** Assert: job exists at once as reading with progress; queue order and "รอคิวที่ N"; only one scanned job reads at a time; resume after a simulated restart uses saved cells and does not re-read them; cancel stops calls and keeps cells; delete removes cells; retry then "อ่านตารางไม่สำเร็จ" then resume; completion produces the same major items as the equivalent Excel SOC and turns checks on; checks stay off before completion.
- **Gate tests.** Missing `TYPHOON_API_KEY` refuses a scanned PDF; the upload confirm is required for scanned files and not shown for text PDFs.
- Prior art: the text PDF SOC converter tests, the Excel SOC reader tests, the upload tests, the PDF page view test, and the SOC cancel tests. Run the existing SOC suite to confirm Word, Excel and text PDF jobs behave as before. The prisma dev test DB needs a fresh name (next is test-db14 or later, check the memory notes).
- **Manual acceptance (not committed, file too large and MAX_PATH):** run USO 4 School from a short local path against the real Typhoon key. Expect about 838 rows over 85 pages, spot-check rows against the Sonnet read from the prototype (the prototype measured 171 of 181 cells identical), check that pages 7 and 30 keep their inner table in one cell, and measure total time (about 62 minutes at 30 calls per minute).

## Out of Scope

- Tables without ruled lines.
- Reading with Claude on the Runner, or any other OCR engine. Measured and rejected on 2026-10-16 (ADR 0010 amendment): PaddleOCR, RapidOCR and EasyOCR (48-57% identical), Gemini 3.8 Flash on whole pages (90%, rewrites text), Haiku 5.5 on the Runner (93%, swapped the party in one sentence, about 34% cheaper than Sonnet). Azure Document Intelligence and Google Vision need billing, which the user cannot provide. They stay recorded as fallbacks only.
- Using a local OCR engine to skip Typhoon calls for repeated boilerplate offer cells (would cut about 20 minutes). Deferred until the live run (ticket 10) shows the real time; revisit only if the full read is much longer than 40 minutes.
- Per-row human confirmation of OCR text.
- Reading images inside TOR cells beyond making an Image Row.
- Running more than one scanned read at a time, or any way to raise the Typhoon limit (the user cannot buy a higher limit; using several keys or accounts to get around it is not done).
- Rotating the leaked Typhoon key and getting Typhoon's data retention terms. The user does these before production use.

## Further Notes

- Typhoon documents 20 requests per minute for `typhoon-ocr`, no daily or monthly cap, and no retention terms. The user confirmed on 2026-10-15 that sending bid documents to an external service is allowed.
- Time estimate: about 838 rows times 4 columns is many cells, but the prototype measured about 100 minutes for one 85-page file at the rate limit. Short and empty cells may be skipped by the cutter to save calls.
- The prototype scripts and findings live in `.scratch/soc-scanned-pdf/prototype/`. Treat them as reference, not production code.
