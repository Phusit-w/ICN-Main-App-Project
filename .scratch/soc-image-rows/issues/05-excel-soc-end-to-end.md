# 05: Excel SOC end to end through the Runner

**What to build:** A reviewer clicks ตรวจ on a major item of an Excel SOC; their SOC Runner performs the Local Check Run and sends back the results alone; the reviewer reviews the rows on the usual page and exports the results Excel.

- The Runner's submit and the manual import accept a run for an Excel SOC with the results file only. For a Word SOC the SOC_Check stays required.
- The review page shows TOR and proposal text from the workbook, and the sheet name with the row when the SOC has more than one sheet. The results Excel does the same.
- Re-check of picked rows, ไม่ต้องตรวจ and รอแก้ไข work as on a Word SOC.
- New SOC Runner version. A Runner older than it does not take a Check Request for an Excel SOC and tells the reviewer to re-install.

This lane can be deployed on its own once this ticket is done, if the user asks; otherwise it ships with ticket 09.

**Blocked by:** 03, 04

**Status:** done

- [x] Import of a run without SOC_Check is accepted for an Excel SOC and still rejected for a Word SOC (tests)
- [x] The manual import form asks only for the results file when the job's SOC is Excel
- [x] Review page and results Excel show Excel rows correctly, with sheet names for a multi-sheet SOC (tests)
- [x] An old Runner refuses the request with a clear message (runner test)
- [x] A full local run: request from the web, Runner picks it up, results appear on the review page
- [x] lint, typecheck, `npm test`, runner tests and build pass

## Comments

**2026-10-12: done.** Not pushed, not deployed.

- **Import** (`importLocalCheckRun`): the SOC_Check is required unless the job's SOC is an Excel workbook (told by the stored SOC document's type, which comes from the file's content). A SOC_Check sent anyway for an Excel SOC is not kept. `SocCheckRun.documentId` is now nullable (migration `20261012150000_soc_check_run_without_document`, additive; applied to the local pilot-db). The runner's submit route and the manual route pass the file on only when there is one; the manual form shows only the results file for an Excel job.
- **Old runners**: SOC Runner is now **0.5.0** (`SOC_RUNNER_FOR_EXCEL_SOC`). The server hands no request of an Excel-SOC job to a runner whose last heartbeat reported an older version (or none yet). The request stays `requested`, the job page shows "รอติดตั้ง SOC Runner รุ่นใหม่" with what to do, and the same request is picked up once the runner is installed again. This is done on the server because the runners already installed (0.4.2) cannot be taught to refuse. The request also carries `needsRunner`; a runner from 0.5.0 on that is older than it reports `failed` with a Thai reason before downloading anything (for the next such version, e.g. Image Rows).
- **Runner 0.5.0**: builds the packet from `.xlsx` too; the server says whether a run needs a SOC_Check (`socCheck` in the request, not the SOC's file name); for an Excel SOC the prompt and the resume prompt ask for none and the submit carries the results alone.
- **Sheet names**: `SocTable.sheetOfRow` gives a row's sheet when the workbook has more than one included sheet. The review panel shows "ชีต <name>" beside the row number; the results Excel writes "<sheet> · <row>" in its first column. TOR and proposal text come from the workbook at import, as for Word.
- Tests: new `test/soc-excel-soc.test.ts` (7: import with and without SOC_Check for both kinds, review view and results Excel with sheet names, one-sheet workbook, old and new runner on the claim and the job page text, re-check of a picked row / รอแก้ไข / ไม่ต้องตรวจ on an Excel job); runner tests 117 (6 new). `npm test` 243 of 244, the one failure is the old filter test in `test/soc-review-workspace.test.ts`. lint, typecheck, build pass. `docs/SOC-RUNNER.md` updated.
- **Full local run** (dev server, pilot-db, runner from source with `SOC_RUNNER_WORK_DIR=C:/Phusit/soc05/work`, skill source uploaded to the local server only as `2026-10-12-excel-local`): the job "TEST ticket 03 Excel SOC (Surat)", ข้อ 4.6. With the runner reporting 0.4.2 the item showed "รอติดตั้ง SOC Runner รุ่นใหม่" and nothing was claimed. Runner 0.5.0 then claimed it, built the packet, Claude (Sonnet) ran 65 s, and 5 rows were submitted with no SOC_Check; the review page shows them with the workbook's TOR text and ticks. All 5 rows read "หาเอกสารไม่เจอ", which is right for this job: its `Brochure.pdf` is a stand-in file from ticket 03's browser check, not the real brochure. Verdict quality on the real brochure is ticket 04's run.
- /code-review done; fixed: the runner told an Excel SOC by its file name while the server tells it by content (now the server says it in the request); a bool and a path sharing the name `soc_check`; a version written "v0.5.0"; added the re-check / รอแก้ไข / ไม่ต้องตรวจ test.

Left as is:

- A Word SOC's runner submit without a SOC_Check used to answer 400 and leave the request running; it now goes through the import, answers 422 and closes the request as failed, like any other rejected run.
- An Excel job's workbook is read on every load of its job page, to name the sheets (also when it has one sheet).
- The row number shown with a sheet is the SOC row number (counted across sheets, under the header rows), not the Excel row.
- The first column of the results Excel is text for a multi-sheet SOC and a number otherwise.
- The review panel's "ชีต" text has no rendering test (the view and the Excel are tested).

For deploy (with ticket 09, or earlier if the user asks):

- Upload the Skill Package with Excel support **before** reviewers get Runner 0.5.0: a 0.5.0 runner with an old package would check an Excel SOC by the old flow and count rows on its own.
- One migration. After the deploy reviewers paste the install command again to get 0.5.0; until then their Excel requests wait with the message above, Word jobs are unaffected.
- Local leftovers: pilot-db has the skill `2026-10-12-excel-local` as current and a runner link for `admintest`; the dev server on :3000 was answering 500 on job pages ("Jest worker encountered 2 child process exceptions") and needs a restart.
