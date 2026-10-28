# Spec: สร้าง SOC (SOC Builder)

Status: ready-for-agent

Grilled 2026-10-27 (`DECISIONS.md`, 28 decisions + corrections). Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`, section "สร้าง SOC (SOC Builder)". Builds on ADR 0011 (a SOC Build is its own record, supersedes ADR 0002), ADR 0007 (per-app access), ADR 0008 (AI runs only on the reviewer's SOC Runner) and ADR 0010 (scanned PDFs read by Typhoon in the background, one at a time). Resumes the paused 2026-09 table-builder thread (`../../../SOC-TABLE-BUILDER-WEB-GRILL-2026-09-09.md`), whose desktop tool is `SOC Tool/Create SOC Tool/create_soc_vision.py`.

## Problem Statement

Before a bid, someone in the department has to make the SOC by hand: open the TOR PDF, copy every numbered requirement of the spec section into the customer's SOC table, one row per item, with the right item numbers. It takes hours, mistakes slip in (a skipped item, a changed word, a wrong number), and scanned TORs have to be retyped. The SOC app can already check a finished SOC and compare its TOR text with the TOR (TOR Match), but nothing helps make the SOC in the first place. Not everyone in the department has a paid AI plan, so the tool must work without one.

## Solution

A new sub-menu in the SOC app, **สร้าง SOC**. The user uploads the TOR PDF (text or scanned), types the page ranges of the part they need (`12-40, 55-60`), and picks a SOC Template from the shared list or uploads one for this build. The server splits those pages into numbered TOR items by code (no AI, no quota) and fills the template: one row per numbered item, each major item starting with a bold heading row, offer / reference / remark columns left empty. The user downloads `SOC-<title>.docx` (the Generated SOC Draft) and sees a warning list: items that could not be split cleanly, items with a picture to paste by hand (with the TOR page), unread pages.

A scanned TOR is read by Typhoon after the user confirms sending it out; the build waits in the shared OCR queue and shows progress. Its draft is labelled Beta: every row must be read against the real TOR. For scanned builds an optional button **ให้ AI ทวนข้อความ OCR** sends the chosen pages' text and images to the user's own SOC Runner; the AI returns only corrections, which the build applies to the Word file and lists one by one.

Builds are kept in their own list (title, status, download, delete) and deleted automatically 30 days after creation. They are separate from SOC check jobs.

## User Stories

1. As a department member, I want a สร้าง SOC menu inside the SOC app, so that I find it next to the SOC check.
2. As a department member without a paid AI plan, I want to build a SOC from a TOR, so that I can do the job without Claude or any AI.
3. As a user, I want to upload a TOR PDF that has a text layer, so that the build reads it directly.
4. As a user, I want to upload a scanned TOR PDF, so that I don't have to retype it.
5. As a user uploading a scanned TOR, I want to confirm before it is sent to the external OCR service, so that I know where the document goes.
6. As a user, I want to type one or more page ranges (`12-40, 55-60`), so that only the spec part of the TOR goes into the SOC.
7. As a user with a scanned TOR, I want only my chosen pages sent to OCR, so that it is faster and less of the document leaves the company.
8. As a user, I want a clear error when a page range is invalid or beyond the TOR's last page, so that I can fix it before the build starts.
9. As a user, I want to pick a SOC Template from a shared list, so that I don't upload the same customer layout every time.
10. As a user, I want to upload my own SOC Template for one build, so that I can use a customer layout that is not in the list.
11. As a user, I want to add a template to the shared list with a name, so that colleagues can reuse it.
12. As a user, I want a template refused when its table is not in the layout the SOC check reads (item number in column 1, TOR in column 2), so that every draft can later be checked.
13. As the person who added a template, I want to delete it, so that the list stays clean.
14. As an ADMIN, I want to delete any template, so that wrong or outdated ones can be removed.
15. As a user, I want to be stopped from deleting someone else's template, so that the list is not changed by mistake.
16. As a user, I want one SOC row per numbered TOR item (e.g. ๔.๓.๑), so that the SOC follows the TOR item by item.
17. As a user, I want unnumbered sub-lists ((ก), bullets) kept as lines inside their parent item's row, so that a requirement is not split away from its item.
18. As a user, I want each major item / annex to start with a bold heading row, so that the SOC is readable and the SOC check finds its major items.
19. As a user, I want every row to keep the template row's font, size, borders and column widths, so that the draft looks like the customer's form.
20. As a user, I want the item numbers written as in the TOR (Thai digits kept), so that they match the TOR the customer reads.
21. As a user, I want the rest of the template (cover text, headers, footers, other content) left as it is, so that only the table is filled.
22. As a user, I want the offer, reference and remark columns left empty, so that the bidder fills them.
23. As a user, I want a text table inside a TOR item turned into multi-line text in that row, so that its content is not lost.
24. As a user, I want a warning naming the item and TOR page when an item contains a picture, so that I paste it by hand in Word.
25. As a user, I want a warning when part of the chosen pages could not be split into numbered items, so that I check that part myself.
26. As a user, I want a warning naming pages that could not be read, so that I know what is missing.
27. As a user, I want Thai text extracted correctly (PUA characters, < > ≤ ≥ ± symbols), so that the draft does not contain garbled characters.
28. As a user, I want the build's title to default to the TOR file name and be editable, so that I can name it as I like; duplicates are allowed.
29. As a user, I want to download the draft as `SOC-<title>.docx`, so that I can open it in Word.
30. As a user, I want a list of my builds with title, status and date, so that I can come back to them.
31. As a user, I want to see progress ("รอคิวที่ N", pages read) while a scanned TOR is read, so that I know how long to wait.
32. As a user, I want to cancel a scanned read and resume it later, so that I can stop a wrong build without losing work.
33. As a user, I want a failed read shown with a resume button, so that a Typhoon outage does not lose the build.
34. As a user, I want to delete a build, so that I can clear mistakes.
35. As a user, I want builds deleted automatically after 30 days, so that TORs don't pile up on the server.
36. As a user of a scanned build, I want the draft and the build page labelled Beta with "ทวนทุกข้อเทียบ TOR จริง", so that OCR mistakes don't reach the customer.
37. As a user with a SOC Runner, I want an optional ให้ AI ทวนข้อความ OCR button on a scanned build, so that the AI catches OCR misreads.
38. As a user, I want the confirm before AI proofreading to name the AI of the Runner that will take it and say how the data may be used, so that I decide knowingly.
39. As a user, I want the AI to return only corrections, which the build applies and lists (item, old text → new text), so that I can review every change and quota stays low.
40. As a user without a Runner, I want the build to work fully without the AI step, so that AI is never required.
41. As a user, I want a draft that the SOC check reads back with the same rows, item numbers and major items, so that I can later upload the filled SOC for checking.
42. As a SOC check user, I want builds kept out of the SOC check list, so that the check list shows only check jobs.
43. As someone without SOC app access, I want to be kept out of สร้าง SOC, so that access follows the SOC app.
44. As an ADMIN, I want build creation, template adds/deletes and build deletes written to the activity log, so that I can trace who did what.

## Implementation Decisions

- **Separate record (ADR 0011).** A new model for builds (owner, title, TOR file, template file, page ranges, status, read progress, warnings, output file, created / purge time) and one for stored SOC Templates (name, file, added by). Additive migrations only. No change to `SocJob`.
- **Place and access.** Routes under the SOC app as a sub-menu; same per-app access check as the SOC app (ADR 0007). Template delete allowed to its adder or an ADMIN.
- **Deep module: the SOC builder.** One pure function at the centre: (SOC Template bytes, TOR pages, page ranges) → (Generated SOC Draft bytes, warnings, row count). It owns item splitting and template filling; callers never learn about XML. All behaviour tests go through it.
- **New TOR item splitter** (inside the builder). TOR Match does not split items: it only cuts annex / major sections and locates existing SOC text. The splitter reuses the TOR text reading (`TorPage`), the Thai PUA / symbol normalisation and the annex / major-section cutting from the TOR Match module, and the major-item rules from the major-items module (numbering restarts per heading; a numbered list inside a major item is not a new major item). Output: ordered items (item number as written, text with line breaks, major item, TOR page, has-picture flag) plus warnings for unsplittable stretches. Shared helpers are moved/exported from the TOR Match module rather than copied.
- **Template contract = what the SOC check reads.** The template's first SOC table: column 1 = item number, column 2 = TOR. Validated at template add and at build start by finding that table; refusal message names the problem.
- **Filling.** The template's last row is the row pattern; it is cloned per item (cell properties, run fonts, borders kept), text written into columns 1 and 2, other cells emptied. Major-item heading rows are the same clone with bold text, never merged cells. Line breaks become Word line breaks. The rest of `document.xml` and all other zip parts are copied unchanged. Written with the existing zip reader/writer (no new dependency).
- **One table (decision 26).** Only the first SOC table is filled; all chosen items go into it, each annex starting with its heading row.
- **Round-trip invariant.** Reading the draft with the SOC table reader must give the built items in order, with their item numbers and major items. This is asserted in tests and also checked at build time; a failure is a build error, not a silent draft.
- **TOR reading.** Text TOR: existing text reader, chosen pages only. Scanned TOR: existing scanned reader through the shared OCR queue (one Typhoon read at a time across check jobs, TOR Match and builds), chosen pages only, after the same confirm as TOR Match. Statuses: waiting in queue / reading (pages done of total) / ready / read failed (resume) / cancelled (resume). Pages already read are kept so resume continues.
- **Retention.** Purge 30 days after creation using the same server-start + periodic purge pattern as the SOC trash; deletes stored files.
- **Download.** `SOC-<title>.docx`, Word MIME type, same response helper style as the TOR Match / results Excel downloads.
- **Beta.** Scanned builds show the Beta label and warning on the build page; nothing is inserted into the Word file.
- **AI OCR proofread (last).** A new check-request kind for the SOC Runner, modelled on the TOR Match judge request: the Runner renders the chosen pages as images, sends them with the OCR text, the skill's proofread instructions ask for corrections only (item, old → new), the server applies them to the stored items and rebuilds the draft, and keeps the list. Needs a Runner version bump and a skill package update. The confirm names the Runner's AI.
- **Measuring ticket.** Ticket 01 builds SOCs from the MEA (text), MOF and Apron (scanned) TORs and compares with their real SOCs (rows, item numbers, text), recording the split accuracy before UI work. The last ticket measures the AI proofread on MOF + Apron, and also AI-reads-everything for comparison (estimate 6–12 vs 20–40 quota points per 40 pages).

## Testing Decisions

- Good tests check what a user gets: the draft's rows, item numbers, text, major items and warnings, read back through the real SOC table reader — never XML structure or helper internals.
- **Builder tests** (main seam): templates from `test/docx-fixture.ts`, TOR pages as plain `TorPage` arrays and from `test/pdf-fixture.ts`. Cases: nested numbering, numbering restart per annex, Thai digits, unnumbered sub-lists, text tables, picture pages, page ranges, PUA characters, template with cover text, invalid template, round-trip through the SOC table reader.
- **API / DB tests** (second seam), like `test/soc-tor-attach.test.ts` and `test/soc-tor-scan.test.ts`: create a build (text and scanned), page-range validation, access, template list add / delete rules, OCR queue / cancel / resume, download, delete, 30-day purge.
- **Runner tests** for the proofread request, like the existing TOR judge tests in the Runner suite.
- Real-file measurement (MEA / MOF / Apron) is a dev script plus numbers in the ticket, not a CI test (files are not in the repo).
- Test DB: next fresh name per the memory (`test-db32` or later); never reuse a stopped prisma dev DB.

## Out of Scope

- Excel SOC Templates and the Excel ↔ docx converter (separate grill).
- TOR as Word file (save as PDF first).
- Pasting TOR pictures into the draft automatically.
- Filling more than one table / one table per annex; merged heading rows.
- Filling offer, reference or remark columns; any compliance check of the draft.
- A link from a build to a SOC check job.
- AI reading the whole TOR instead of Typhoon (only measured in the last ticket).
- The Gemini CLI engine for the SOC Runner (its own feature, prototype first; see DECISIONS.md 8–13).
- freellmapi or any multi-provider free-key router.

## Further Notes

- The split accuracy is the main unknown: TOR Match's 82–93% were match rates, not split rates. If ticket 01 shows the splitter is weak on scanned TORs, revisit before building the UI.
- The SOC table reader treats a Word SOC positionally; if real customer templates turn out to differ (e.g. a leading ลำดับ column), extend the reader and the builder together so the round-trip invariant holds.
- User will send 2–3 sample SOC Templates; use them in ticket 01.
