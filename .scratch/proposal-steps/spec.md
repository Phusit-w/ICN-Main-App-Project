# Spec: Proposal (โครงการข้อเสนอ) — step-based proposal work in the SOC app

Status: ready-for-agent
Source: wayfinder map `.scratch/proposal-steps/map.md` (tickets 01–09, all resolved 2026-10-29). Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md` § Proposal. ADRs: 0007 (per-app access), 0008 (checks on the reviewer's machine, amended by 0013), 0011 (SOC Build separate from SOC job), 0012 (Proposal owns its files), 0013 (teammate takes Check Requests).

## Problem Statement

Preparing a proposal today means jumping between separate screens that don't know about each other. A user builds a SOC from a TOR in สร้าง SOC, downloads the draft, fills in the reference column by hand, then uploads the SOC and every Datasheet again to start a separate SOC check job, and attaches the TOR again there to run ตรวจ TOR ตรงต้นฉบับ. Nothing shows which stage a piece of work is at, which SOC file is the latest, or what is left to do. Filling the reference column (document name and page for every row) is slow manual work, and there is no help for it at all. And anyone without their own Claude subscription can't use the AI steps, because a Check Request can only run on the clicking user's SOC Runner.

## Solution

A **Proposal** is one piece of proposal work. It holds the TOR, a numbered list of **SOC Versions** and the **Datasheets**, and shows six **Proposal Steps** on one page as a vertical stepper: TOR, โครง Content (reserved, "เร็ว ๆ นี้"), สร้าง SOC, กรอกอ้างอิง, ตรวจ TOR ตรงต้นฉบับ and ตรวจหลักฐาน. Each step shows its status, what it uses, what it gives, whether it needs AI and whose account would run it, and its buttons. Steps can be done in any order: a step whose input an earlier step would make takes an uploaded file instead. The new **กรอกอ้างอิง** step suggests each empty reference (document and PDF page) — by code first, by AI on a SOC Runner for the rest — and writes the ones a person accepts into a new SOC Version in the team's **Reference Style**. A user without a SOC Runner sends AI work to **รอคนรับ**, where a teammate with a Runner takes it by their own click and runs it on their own account. `/soc` opens on the Proposal list; old SOC jobs and builds stay viewable in their own tabs.

## User Stories

### Proposal list and lifecycle

1. As a SOC user, I want `/soc` to open on a list of Proposals, so that every piece of proposal work starts from one place.
2. As a SOC user, I want to create a Proposal by giving it a title, so that I can start preparing a proposal.
3. As a SOC user, I want a Proposal title to be refused when it matches another live Proposal (ignoring case, surrounding and repeated spaces), so that Proposals are never confused.
4. As a SOC user, I want to see every Proposal of every SOC user in the list, so that the team can work on the same proposal.
5. As a SOC user, I want the list to show title, creator, progress (เสร็จ N/5, โครง Content not counted), current SOC Version, รอคนรับ count and last update, so that I can see where each piece of work stands.
6. As the creator or an ADMIN, I want to rename a Proposal under the same uniqueness rule, so that a typo can be fixed.
7. As the creator or an ADMIN, I want to move a Proposal to the trash, so that finished or wrong work leaves the list.
8. As an ADMIN, I want a trashed Proposal to be purged 30 days later together with its SOC Versions, SOC jobs, SOC Builds and Datasheets, so that storage is freed.
9. As an ADMIN, I want to restore or purge a trashed Proposal early from the existing trash page, so that trash works like it does for SOC jobs.
10. As a SOC user, I want tabs Proposal | งานตรวจเดิม | สร้าง SOC เดิม, so that I can still open SOC jobs and SOC Builds made before Proposals.
11. As a SOC user, I want old SOC jobs to keep working exactly as now (review, check, results Excel), so that nothing in flight is lost.
12. As a SOC user, I want the "+ สร้างงานตรวจ" and "+ สร้าง SOC" buttons gone, so that there is only one way to start work.
13. As a user, I want the launcher tile and sidebar entry to read "Proposal & SOC" with "เตรียมข้อเสนอตั้งแต่ TOR ถึงตรวจหลักฐาน", so that the app's purpose is clear.
14. As a user without SOC app access, I want the Proposal pages refused like the rest of the SOC app, so that per-app access (ADR 0007) still holds.

### Proposal page

15. As a SOC user, I want the Proposal page to show the six steps top to bottom joined by a line, each open, so that I can read the whole state at a glance.
16. As a SOC user, I want each step to show a status badge — เสร็จ, กำลังทำ, ยังไม่ทำ, ต้องทำใหม่ or เร็ว ๆ นี้ — so that I know what is left.
17. As a SOC user, I want each step to show "ใช้:" (input) and "ได้:" (output) and a one-line current state, so that I know what it needs and what it makes.
18. As a SOC user, I want each step to show whether it needs AI (ไม่ใช้ AI / AI ไม่บังคับ / ใช้ AI) and whether it would run on my Runner or go to รอคนรับ, so that I know whose quota it uses.
19. As a SOC user, I want a done step to show a ✓ in its circle, so that progress is visible.
20. As a SOC user, I want chips on top for the Proposal's TOR, current SOC Version and Datasheet count/size, so that I see its files without opening anything.
21. As a SOC user, I want a ↗ link from a step to the existing screen it uses (the SOC Build page, the SOC job page, the review page), so that I keep working where I already know how.
22. As a SOC user, I want the โครง Content step shown greyed as "เร็ว ๆ นี้", so that I know it is coming but can't use it yet.
23. As a SOC user, I want a รอคนรับ panel beside the steps listing this Proposal's waiting requests with a cancel button, so that I can follow work I handed to the team.
24. As a SOC user, I want a Guided Tour on the Proposal list and on the Proposal page, so that a new user learns the flow.

### TOR

25. As a SOC user, I want to upload one TOR PDF to a Proposal, so that every step uses the same TOR.
26. As a SOC user, I want a scanned TOR to ask for OCR confirmation first, as today, so that no file goes to the external OCR without my consent.
27. As a SOC user, I want to replace the TOR, so that I can fix a wrong file.
28. As a SOC user, I want replacing the TOR to mark the current ตรวจ TOR ตรงต้นฉบับ as made from the old TOR (ต้องทำใหม่) and leave already built drafts alone, so that no result silently refers to the wrong TOR.

### SOC Versions

29. As a SOC user, I want every SOC that enters a Proposal to become a numbered SOC Version, so that the history is kept.
30. As a SOC user, I want the latest SOC Version to be the current one that every step uses, so that I never pick the wrong file.
31. As a SOC user, I want to upload a SOC myself (Word, Excel, text or scanned PDF, as the SOC check accepts today) as a new SOC Version, so that I can skip สร้าง SOC or bring in a bidder's corrected SOC.
32. As a SOC user, I want older SOC Versions to stay viewable and downloadable, so that I can compare or go back.
33. As a SOC user, I want each SOC Version to show where it came from (สร้าง SOC, upload, กรอกอ้างอิง) and when, so that I can trace it.

### Datasheets

34. As a SOC user, I want to upload the Datasheets once per Proposal with their folder paths, so that กรอกอ้างอิง and ตรวจหลักฐาน use the same set.
35. As a SOC user, I want to add Datasheets later, so that I can bring in what was missing.
36. As a SOC user, I want to remove a Datasheet, so that a wrong file stops being used.
37. As a SOC user, I want removal refused while a SOC Runner is checking this Proposal, so that a running check isn't broken.
38. As a reviewer, I want a removed Datasheet that an existing check result cites to stay openable from that result, so that a finished review never loses its evidence.
39. As a SOC user, I want the SOC job limits (200 PDFs, 1 GB, 120 MB each, browser batches) applied per Proposal, so that uploads keep working behind IIS.

### สร้าง SOC

40. As a SOC user, I want to build a SOC from the Proposal's TOR with page ranges and a SOC Template, as today, so that I get a Generated SOC Draft.
41. As a SOC user, I want a finished build's draft added to the Proposal as a new SOC Version automatically, so that I don't download and re-upload it.
42. As a SOC user, I want every SOC user who can open the Proposal to see its builds, so that the team can follow them.
43. As a SOC user, I want the build itself to keep its 30-day purge without losing the SOC Version made from it, so that storage rules stay as in ADR 0011.

### กรอกอ้างอิง

44. As a SOC user, I want to start กรอกอ้างอิง on the current SOC Version, so that empty references get suggestions.
45. As a SOC user, I want the code search to run on the server for the whole SOC at once without waiting for any Runner, so that most rows are found immediately and without quota.
46. As a SOC user, I want the code search to find pages carrying the row's item label (e.g. "5.3.1" written on the Datasheet page) and pages whose spec values match the TOR, so that the easy rows are found reliably.
47. As a SOC user, I want rows the code couldn't place sent to AI one major item at a time, on my Runner or to รอคนรับ, with a confirm popup and cancel, so that the hard rows get help too.
48. As a SOC user, I want each suggestion to show document, page, a short snippet from that page that matches the TOR, and where it came from (เลขข้อกำกับ / ค่าสเปก / AI), so that I can judge it quickly.
49. As a SOC user, I want up to two alternative suggestions per row, so that I can pick a better one.
50. As a SOC user, I want to open the suggested page in the viewer the review page uses, so that I can check it myself.
51. As a SOC user, I want to รับ, แก้ or ไม่รับ each suggestion, so that nothing is written without a person's decision.
52. As a SOC user, I want "รับทั้งหมดที่พบจากเลขข้อกำกับ", so that I can accept the near-certain rows in one click.
53. As a SOC user, I want "สร้างฉบับ SOC ใหม่" to write only accepted rows into a new SOC Version and leave the rest empty, without requiring every row to be looked at, so that I can work in passes.
54. As a SOC user, I want rows that already have a full reference never overwritten, so that work already done is safe.
55. As a SOC user, I want a row that names a document but no page to get only a page, searched inside that document and appended to its text, so that half-done references get finished.
56. As a SOC user, I want rows with nothing found shown as "ไม่พบ" with a count on top (พบ N / ไม่พบ M) and left empty in the SOC, so that the SOC sent onward never carries a "not found" note.
57. As a SOC user, I want heading rows and major items set to ไม่ต้องตรวจ left out of the search, so that no quota is wasted.
58. As a SOC user, I want page numbers to be PDF page numbers (page 1 = first page of the file), so that they match what the check assumes.
59. As a SOC user, I want references written in the Proposal's Reference Style — แบบไทย on several lines (`เอกสารส่วนที่ 2` / sub-folder name / `หน้า 3`) or แบบอังกฤษ on one line (`CASRI Product Brochure, page 1`) — so that the SOC looks like the team's.
60. As a SOC user, I want the Reference Style guessed from rows that already have a reference, or else from the SOC's language, and switchable before writing, so that I rarely have to choose.
61. As a SOC user, I want the `เอกสารส่วนที่ N` line to take N from the numbered top Datasheet folder (`บทที่ 2 …` or `2. …`), using the wording of existing rows if they differ, and left out when there is no such folder, so that it matches the proposal's parts.
62. As a SOC user, I want แบบไทย to add a file-name line when a sub-folder holds more than one PDF, so that the exact file is clear.
63. As a SOC user, I want each Datasheet to have a ชื่อที่ใช้อ้างอิง for แบบอังกฤษ, defaulting to the file name without its leading number and anything after " - ", editable once in the Datasheet list, so that references use short names consistently.
64. As a SOC user, I want several pages written as `หน้า 3, 6` / `page 3, 6` (ranges as `12-13`), and several documents as separate blocks (แบบไทย) or joined by `; ` (แบบอังกฤษ), so that rows with more evidence read cleanly.
65. As a SOC user, I want the new SOC Version refused with a warning when any reference it would write doesn't read back to the intended file and page through the check's own reader, so that every reference the system writes can be checked.
66. As a SOC user, I want a Word SOC to stay Word and an Excel SOC (including one made from a PDF SOC) to stay Excel in the new version, keeping the table's look, so that the file can go on to the bidder.

### ตรวจ TOR ตรงต้นฉบับ and ตรวจหลักฐาน

67. As a SOC user, I want starting ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน on a SOC Version to create that version's SOC job automatically (titled "<Proposal> · ฉบับ N"), so that I don't upload anything again.
68. As a SOC user, I want that SOC job to use the Proposal's TOR and Datasheets without copying them, so that storage isn't doubled.
69. As a SOC user, I want both checks of a new SOC Version to start as ยังไม่ทำ and the older version's results to stay with the older version, so that results always match the SOC they checked.
70. As a SOC user, I want a check done on an older version shown as ต้องทำใหม่ with a link to its old result, so that I know to re-run it.
71. As a reviewer, I want the review page, Final Decisions, confirmation and results Excel to work as today inside the version's SOC job, so that review doesn't change.
72. As a SOC user, I want to start at ตรวจหลักฐาน by uploading a SOC and Datasheets, so that the old "check a finished SOC" flow is still one step away.

### รอคนรับ and running AI work

73. As a user with a SOC Runner, I want AI steps to run on my own Runner by default, as today, so that nothing changes for me.
74. As a user without a SOC Runner, I want AI work I start to go to รอคนรับ, so that I can still use the AI steps.
75. As a user with a SOC Runner whose quota is out, I want to choose "ขอให้คนอื่นตรวจแทน", so that I can still get the work done.
76. As a user with a SOC Runner, I want a count of waiting requests on the SOC menu, so that I notice when the team needs help.
77. As a user with a SOC Runner, I want the รอคนรับ list to show Proposal, step, major item, row count, asker and time, so that I can decide what to take.
78. As a user with a SOC Runner, I want to take one major item or "รับทั้งชุด" by my own click, after a popup that it uses my quota, so that my account is only ever used by my decision.
79. As a user, I want nothing to take a request automatically — no server process, script or click automation — so that no account is used for others without its owner (Anthropic's terms, ADR 0013).
80. As an asker, I want to see "ข รับแล้ว" once a teammate takes my request, so that I know it is moving.
81. As an asker, I want to cancel my request any time before its run starts, so that I can withdraw it.
82. As an asker, I want a request to stay in รอคนรับ with no expiry, so that it isn't lost on a quiet day.
83. As an asker, I want a taken request whose taker's Runner goes quiet for 2 minutes to return to รอคนรับ, so that a closed laptop doesn't strand my work.
84. As a reviewer, I want each result to record "ขอโดย ก · ตรวจโดย ข (บัญชีของ ข)", so that it is clear whose account ran it.
85. As a taker, I want a taken request to be claimable only by my own Runner, so that it can't spend anyone else's quota.

## Implementation Decisions

- **Proposal module (new, server).** Owns Proposal create/rename/trash/list, the TOR, SOC Versions, Datasheets, step status, and the hand-offs to SOC Build, SOC job and Check Requests. It is the only place that knows step order and status; pages and actions call it. Access: every user with `soc` app access may open and work on any Proposal; rename and trash are creator or ADMIN.
- **Schema (new models, one migration, additive only).**
  - `Proposal`: title (unique among live Proposals by the Job Title rule), creator, Reference Style (`thai` | `english` | unset = guess), trash fields (`trashedAt`, `purgeAfter`) like SocJob.
  - Proposal files: one TOR document per Proposal (replaceable; replacing keeps the old row only while something cites it), SOC Versions (number, source = build | upload | reference_fill, created at, the SOC file, for a PDF SOC also its source PDF and row pages as today), Datasheets (folder path, Citation Name, sha256, size, removed-at for soft removal).
  - Links: `SocJob.proposalId` + the SOC Version it checks (one job per version); `SocBuild.proposalId` (build access widens to Proposal access when set).
  - Reference Fill state per SOC Version run: suggestions per row (document, page(s), snippet, source, alternatives, decision accepted/edited/rejected/none).
  - Old SocJobs and SocBuilds without a Proposal are untouched.
- **Storage.** Proposal files live under a per-Proposal folder with the existing write-once, sha256, uuid-name storage helper. A SOC job created for a version references the Proposal's Datasheets (no copy); the Runner document API serves a job's evidence from the Proposal's live Datasheets when the job belongs to a Proposal. A removed Datasheet stays on disk while any check result cites it; the purge deletes it when nothing does or with the Proposal.
- **Step status (derived, not stored).** Computed from the Proposal's files and linked runs: TOR = done when a TOR exists; โครง Content = reserved; สร้าง SOC = done when any SOC Version exists from a build, doing while a build is running; กรอกอ้างอิง = doing while a run on the current version has undecided suggestions or open AI requests, done once a reference_fill version is current or the current version has no empty references; ตรวจ TOR ตรงต้นฉบับ / ตรวจหลักฐาน = from the current version's SOC job, ต้องทำใหม่ when only an older version (or the old TOR) has a result. Progress "เสร็จ N/5" counts all steps except โครง Content.
- **SOC Build hand-off.** Building from a Proposal uses its TOR; on READY the draft is stored as a new SOC Version (source = build). The build keeps ADR 0011's 30-day purge.
- **SOC job per SOC Version.** Created lazily by the Proposal module when ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน first starts on that version, through the existing imported-job creator fed with stored bytes (ADR 0011's "use this draft" path, set by ADR 0012). The version's TOR Match uses the Proposal's TOR.
- **กรอกอ้างอิง, code step (new module, server).** One deep function: given a SOC table and the Proposal's Datasheets (text per page, as the TOR/evidence readers already extract), return per row either suggestions or ไม่พบ. It reuses the SOC table reader, the reference-column finder, item-label extraction and the printed/PDF page mapping that the Evidence Packet builder already has (ported or shared, not re-invented), plus a spec-value match against the row's TOR text. Rows with a full reference are skipped; title-only rows search only the named document.
- **กรอกอ้างอิง, AI step.** A new Check Request kind (like `tor_judge`) per major item for rows the code step left. The Runner builds an input from the rows and the candidate Datasheets and runs the skill; the result returns suggestions in the same shape as the code step. Needs a skill addition and a Runner version bump.
- **Reference writer (new module).** Given accepted suggestions, the Reference Style and the Citation Names, writes a new SOC Version: Word stays Word (cell text only, table look kept), Excel stays Excel. Text rules (ticket 09):
  - แบบไทย: `เอกสารส่วนที่ N` (N from the numbered top folder, wording from existing rows if any, line omitted when none) / sub-folder full name / file-name line when that folder has more than one PDF / `หน้า 3, 6` or `หน้า 12-13`; several documents = one block each on new lines.
  - แบบอังกฤษ: `<Citation Name>, page 3, 6`; several documents joined by `; `.
  - Title-only rows: append `หน้า N` on a new line or `, page N`; existing text untouched.
  - Guard: every reference to be written is parsed back with the same rules the check's reader uses (chapter, dotted folder number, ≥60% file-name words, page parts); any that doesn't resolve to the intended file and page blocks the write and is listed.
- **Reference Style guess.** From existing references in the SOC (Thai page words / multi-line → แบบไทย; `page` → แบบอังกฤษ), else the SOC's TOR text language; stored on the Proposal once chosen.
- **Check Request claim rule (amends ADR 0008, per ADR 0013).** A request has an asker and an optional taker. Claimable by a Runner when its user is the taker, or is the asker and the request was not sent to รอคนรับ. "Take" is a server action requiring the taker's active Runner Link and an explicit confirm; there is no API or flag that takes automatically. A taken request whose Runner goes quiet past the existing stale time returns to รอคนรับ (taker cleared). Cancel by asker or ADMIN before running. Results record asker and taker.
- **Navigation.** `/soc` = Proposal list; tabs Proposal | งานตรวจเดิม (today's job list) | สร้าง SOC เดิม (today's build list); create buttons removed from the old tabs; launcher tile/sidebar renamed. Existing Guided Tours for the job list and new-job page are updated for the removed buttons; two new tours (Proposal list, Proposal page).
- **Proposal page layout (from the prototype, variant A).** Decision-rich shape of a step card:

  ```ts
  // from prototype branch prototype/proposal-page (variant A)
  type StepStatus = "done" | "doing" | "todo" | "stale" | "reserved"; // เสร็จ/กำลังทำ/ยังไม่ทำ/ต้องทำใหม่/เร็ว ๆ นี้
  type StepCard = {
    no: number; title: string; status: StepStatus;
    ai: "ไม่ใช้ AI" | "AI ไม่บังคับ" | "ใช้ AI";   // + "Runner ของคุณ" | "ไม่มี Runner → รอคนรับ"
    needs: string; gives: string; now: string;      // ใช้: / ได้: / current-state line
    actions: string[]; skip?: string; link?: string; // main action first, "อัปโหลด … เอง", ↗ old screen
  };
  ```

## Testing Decisions

- Good tests drive the feature from the outside — server actions, runner routes, or one public function — with a real test database and real files, and assert what a user or Runner would observe (rows, statuses, files, refusals), never internal helpers or query shapes.
- **Seam A — Proposal server actions + test DB.** Create/rename/unique title, trash/restore/purge (cascade to versions, jobs, builds, Datasheets), TOR replace marking TOR Match stale, SOC Version numbering and current version, build READY → new version, lazy SOC job per version using the Proposal's Datasheets, step statuses including ต้องทำใหม่, Datasheet add/remove (refused while running; cited file kept), per-Proposal limits, access for non-SOC users. Prior art: `test/soc-imported-job.test.ts`, `test/soc-job-title.test.ts`, `test/soc-builds.test.ts`, `test/soc-tor-attach.test.ts`.
- **Seam B — Runner API routes + server actions.** รอคนรับ: request without a Runner is not claimable by anyone until taken; take requires a Runner Link and confirm; only the taker's Runner claims it; stale taker returns it; asker cancel; asker/taker recorded on import; existing own-Runner flow unchanged; the กรอกอ้างอิง request kind round trip (claim, download, submit suggestions). Prior art: `test/soc-check-requests.test.ts`, `test/soc-tor-judge.test.ts`, `test/soc-runner-link.test.ts`.
- **Seam C — กรอกอ้างอิง code step and reference writer.** Fixture SOCs (Word and Excel) and Datasheet PDFs: label match, spec-value match, title-only row gets a page inside the named document, full reference skipped, ไม่พบ, skipped major items left out; writer output for แบบไทย and แบบอังกฤษ (single/multi page, multi document, multi-file folder, no numbered top folder), title-only append, the read-back guard refusing an unresolvable Citation Name, and every written version reading back through the SOC table reader with unchanged row count. Use the MOF RFID and Apron reference shapes from ticket 08 as expected text. Prior art: `lib/soc-builder.test.ts`, `test/docx-fixture.ts`, `test/pdf-fixture.ts`, `lib/soc-table-excel.test.ts`.
- Runner side of the AI step: `soc-runner/test_runner.py` (new request kind handled, submit shape); skill side in the skill's own tests.
- UI: browser check (light, dark, narrow) of the Proposal list, Proposal page, กรอกอ้างอิง review table and รอคนรับ list, as for every SOC screen.

## Out of Scope

- Generating the โครง Content itself (its step is shown reserved only); using โครง Content headings in references.
- Any central or shared Claude account, and any automatic taking of requests (server process, script, click/mouse automation) — forbidden by Anthropic's terms (ADR 0013).
- A pay-per-use API engine; Gemini CLI or Codex CLI engines for the Runner; Enterprise-contract server runs.
- Carrying check results across SOC Versions; an activity log for Proposals; email notifications.
- Attaching old SOC jobs or builds to a Proposal ("สร้าง Proposal จากงานนี้").
- Archive state separate from trash.

## Further Notes

- Long Windows paths: sample folders exceed MAX_PATH (Apron Proposal A); server storage uses short uuid names, but any Runner work folder must stay short, as already learned in the evidence-packet work.
- ADR 0013 notes the รอคนรับ pattern is not named as allowed by Anthropic's terms, only far from the forbidden shape; if the team grows reliant on it, company Team seats need no code change.
- Rollout: the migration is additive; old jobs and builds keep working; the Runner version bump for the new request kind means reviewers re-paste the install command after deploy, as with earlier Runner releases.
