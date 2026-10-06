# Spec: SOC checks run on the reviewer's machine (SOC Runner + Imported SOC Check)

Status: ready-for-agent

> สรุปภาษาไทย: ให้ทีมตรวจ SOC ด้วย Claude โดยไม่ใช้ API key แบบเสียเงินและไม่รันโมเดลบน server
> แต่ละคนรัน Claude บนเครื่องตัวเองด้วย Claude Pro ของตัวเองผ่าน **SOC Runner** ซึ่งติดตั้งด้วยการดาวน์โหลดแล้วกดติดตั้ง และไม่ต้องใช้สิทธิ์ admin
> server ทำหน้าที่เก็บไฟล์ เก็บ skill แสดงผล และให้คนยืนยันผลเท่านั้น
> ช่วงที่ 1 = นำเข้าผลด้วยมือ + หน้ารีวิวใหม่ / ช่วงที่ 2 = SOC Runner + ตัวติดตั้ง

Vocabulary follows `docs/SOC-DOMAIN-GLOSSARY.md`: **Local Check Run**, **Imported SOC Check**, **SOC Runner**,
**Check Request**, **Citation Result**, **Evidence Support**, **Declared Selection**, **System Recommendation** and
**Final Decision**. The governing ADR is **0008** (checks run on the reviewer's machine; the server stores and shows only).
These ADRs still apply: **0002** (job kinds on `SocJob`), **0007** (per-app access, `soc`), and
`ADR-SOC-AUTO-PASS-POLICY` / `ADR-SOC-HUMAN-REVIEW-AND-OCR` (a human confirms every Final Decision, and nothing is auto-passed).
Grill record: this conversation, 2026-10-05/06, Q1–Q27.

## Problem Statement

The team needs to check SOC tables (100–500 rows each) against vendor Datasheet/Catalog PDFs, item by item.
The check covers reference pages, item labels, highlights, product identity, evidence support, and whether the
offer is Comply or Better against the TOR. Doing this by hand is slow and error-prone. Claude does it well:
Sonnet agreed with the corrected gold on 89% of the 12-case demo bench. But neither earlier way of running
Claude works:

- The company server (192.168.51.43) can't run a local model fast enough.
- A billed API key isn't affordable.
- A personal Claude Pro login may not be installed on a shared server to serve other people.

The existing `/soc` module in the web app was built for a server-side worker, so it can't be used either.
Its review page is also hard to read: there are too many columns, the PDF has to be opened separately, and
nothing tells the reviewer which rows need attention first.

Reviewers aren't technical. They want to click a button on the website and get results, without installing
several tools or moving files around. Company machines give them no admin rights.

## Solution

Each reviewer installs the **SOC Runner** once: download from `/soc`, run the installer, then authorise their
own Claude account in the browser once. After that:

1. A reviewer creates a SOC job on `/soc`. They upload the SOC `.docx` and the evidence PDFs once.
2. They click **ตรวจ** on a major item (ข้อใหญ่), or on the whole SOC. This creates a **Check Request** that
   belongs to them.
3. Their own SOC Runner picks up the request. It downloads the files and the current SOC skill from the
   server. It runs Claude on their machine under their own subscription, with every check enabled. Then it
   sends the results back.
4. The job page shows progress per major item, e.g. "ตรวจแล้ว 3/7 ข้อใหญ่". It also shows clear states:
   waiting for the reviewer's machine, paused until quota returns, missing documents, done.
5. The redesigned review page lists rows with one overall status each (✅ / ⚠️ / ❌), problem rows first. Each
   row expands to show the detailed axes, with the cited PDF page and its highlights shown next to the TOR text.
   A person confirms each Final Decision.
6. The team downloads the `SOC_Check` document from the website.

The server never runs Claude. There is no rule-based pre-check: every finding comes from Claude, so reviewers
see one source of truth. Until the SOC Runner ships (phase 2), a reviewer can run the skill in Claude Code
themselves and upload the outputs by hand (phase 1). Both paths use the same import.

## User Stories

**Creating and organising work**

1. As a reviewer, I want to create a SOC job by uploading one SOC `.docx` and its evidence PDFs, so that the whole team works from the same files.
2. As a reviewer, I want the job to list the SOC's major items (ข้อใหญ่), so that I can check them one at a time and keep each Claude session within a size that stays accurate.
3. As a reviewer, I want to see, per major item, whether it is not yet checked, requested, running, paused, needs documents, checked, or confirmed, so that I know where the job stands at a glance.
4. As a reviewer, I want to see progress like "ตรวจแล้ว 3/7 ข้อใหญ่" on the job list and the job page, so that I can tell how far along a SOC is.
5. As any user with `soc` access, I want to open any SOC job and request checks on any of its major items, so that several of us can split one large SOC between us.
6. As a user with `soc` access, I want to see who requested and who ran each major item's check, so that I know whom to ask about a result.
7. As a reviewer, I want to add more evidence PDFs to an existing job, so that I can supply a document Claude reported as missing.

**Requesting a check (phase 2)**

8. As a reviewer, I want to click ตรวจ on a major item, so that it gets checked without me opening any other program.
9. As a reviewer, I want a "ตรวจทั้งชุด" button, so that I can queue every unchecked major item at once.
10. As a reviewer, I want my Check Requests to run only on my own machine, so that only my own Claude quota is used, never a colleague's.
11. As a reviewer, I want a request to wait with a clear "รอเครื่องของคุณเปิด" state when my machine is off, so that I understand why nothing is happening.
12. As a reviewer, I want to cancel a request that hasn't started, so that I can fix files before it runs.
13. As a reviewer, I want every check to run in full mode (full_audit + evidence_support + tor_decision), so that I never have to understand the skill's modes.

**While a check runs (phase 2)**

14. As a reviewer, I want to see that my SOC Runner is online, and when it was last seen, so that I know requests will be picked up.
15. As a reviewer, I want a check to stop before it spends quota on the rows when documents the SOC cites are missing. I want to see the missing names and choose [อัปโหลดเพิ่ม] or [ตรวจต่อโดยไม่มีไฟล์นี้], so that I don't waste quota on rows that can't be verified.
16. As a reviewer, I want a check that runs out of Claude quota to pause, show "หยุดชั่วคราว จะตรวจต่อประมาณ HH:MM", keep the rows already done, and resume on its own, so that I don't have to babysit it.
17. As a reviewer, I want a failed check to show a plain-Thai reason and a retry button, so that I can recover without help.
18. As a reviewer, I want to be told when my SOC Runner needs me to sign in to Claude again, so that an expired login doesn't silently stall my requests.

**Importing results**

19. As a reviewer in phase 1, I want to upload the `results.json` and `SOC_Check` document from a Claude Code run for one major item, so that I can use the web review before the SOC Runner exists.
20. As a reviewer, I want a malformed or incomplete results file rejected with a clear reason, so that broken results never reach the review page.
21. As a reviewer, I want results for one major item added to the existing job without touching other major items, so that a team can build up one SOC piece by piece.
22. As a reviewer, I want a re-check of a major item to replace its previous results, with the old results kept in the audit trail, so that the page always shows the latest check and nothing is lost.
23. As a reviewer, I want a warning before a re-check replaces rows someone already confirmed, so that confirmations aren't discarded by accident.
24. As a reviewer, I want each major item's result to record the skill version and Claude model it came from, so that results from different runs can be compared.

**Reviewing**

25. As a reviewer, I want each row to show one overall status (✅ ไม่พบปัญหา / ⚠️ ต้องดู / ❌ มีปัญหา), so that I can scan hundreds of rows quickly.
26. As a reviewer, I want rows with problems listed first, and a filter by status, so that I spend my time where it matters.
27. As a reviewer, I want to expand a row to see every check axis with a Thai label and the reason given, so that I can understand why it got its status.
28. As a reviewer, I want to see the cited PDF page and its highlights next to the TOR text and the bidder's text, so that I can verify a row without opening files myself.
29. As a reviewer, I want the Declared Selection (Comply/Better ticked in the SOC) shown next to the System Recommendation, so that I can see disagreements immediately.
30. As a reviewer, I want to set the Final Decision for a row and add a note, so that the human judgement is recorded separately from Claude's recommendation.
31. As a reviewer, I want to be able to confirm rows from a check I ran myself, so that a single reviewer can finish a SOC.
32. As a reviewer, I want no "confirm all" button that treats recommendations as decided, so that every Final Decision is a deliberate human act.
33. As a reviewer, I want a banner on a major item that was checked with missing documents, so that I know some rows were unverifiable for that reason.

**Output**

34. As a team member, I want to download the `SOC_Check` document for the job, so that I can use it in the bid package.
35. As a team member, I want the downloaded document to show the latest result per major item, so that superseded runs never appear in it.

**Installing the SOC Runner (phase 2)**

36. As a reviewer, I want to download the SOC Runner from `/soc` already linked to my web account, so that I never have to type a pairing code.
37. As a reviewer on a company PC without admin rights, I want the installer to work entirely within my user profile, so that I don't need IT to install it.
38. As a reviewer, I want the installer to bring everything it needs (its own runtime, Claude Code, and Git if Claude Code needs it), so that I don't install anything else.
39. As a reviewer, I want the SOC Runner to start by itself when I log in to Windows and stay out of the way, so that I never have to remember to open it.
40. As a reviewer, I want the installer to open the Claude sign-in page for me once, so that linking my own Claude account is one click.
41. As a reviewer, I want to see a short Thai explanation of the Windows SmartScreen warning on the download page, so that I'm not alarmed when it appears.
42. As an admin, I want to revoke a reviewer's SOC Runner link, so that a lost or reassigned PC can't take requests.
43. As a reviewer, I want to re-download the installer to replace a broken install, so that recovery is the same as installing.

**Skill management**

44. As an admin, I want to upload a new version of the SOC skill to the server, so that every SOC Runner uses it on its next check without anyone reinstalling.
45. As an admin, I want to see which skill version is current and which version each major item was checked with, so that I can decide whether to re-check old items.

**Governance**

46. As an admin, I want every import, check request, re-check, confirmation and runner link/revoke written to the audit trail, so that the history of a SOC is traceable.
47. As an admin, I want imported jobs to follow the existing 90-day expiry and private-storage rules, so that SOC files aren't kept or exposed longer than today.

## Implementation Decisions

**Job model**

- An Imported SOC Check is a `SocJob` with a new job kind, "imported" (ADR 0002 pattern). It skips
  `QUEUED`/`PROCESSING` and lives in `NEEDS_REVIEW` until confirmed. The existing server-side worker never
  picks up this kind.
- Major items are a new per-job record, one row per ข้อใหญ่. Each record holds: label and order, check state,
  the latest Local Check Run's skill version, model and run time, who requested it and who ran it, and any
  missing-document list. The record is created when the job is created, from the SOC's top-level item numbers.
  Extracting those numbers is a deterministic table-structure read, not a compliance check, so it doesn't
  conflict with "no rule-based pre-check".
- The major item check states are: `not_checked → requested → running → (paused_quota | needs_documents) →
  checked`. A request can also go to `failed`. When every row of a major item has a Final Decision, it shows
  as `confirmed`.
- Check results get storage for every axis the skill produces in full mode: reference_check (+ detail),
  heading_title_check, product_identity, content_relevance, item_label_check, highlight_check (+ evidence),
  evidence_support (+ detail), tor_decision (+ basis, verified value, TOR threshold), declared_status,
  declared_status_check, detail, confidence and key_issue. Each row records its major item and the run it
  came from. The legacy `ai*` and `final*` columns remain for compatibility, but the new review page reads the
  new fields. The Final Decision and the reviewer's note are stored separately from the System Recommendation.
- The overall row status (✅/⚠️/❌) is derived when read. It is not stored, so the rule can change without a
  migration.
- Access (Q17 = b): any user with `soc` access may view any job, add evidence, request checks, import results
  and confirm rows. ADMIN keeps everything. Today's owner-only job authorisation is widened for imported jobs.

**Import module (seam 1)**

- One server-side import operation, `import a Local Check Run`. It takes the job, the major item, the parsed
  `results.json`, the `SOC_Check` document and run metadata (skill version, model, runner or manual). It
  returns either the stored result or a list of validation errors. Manual upload (phase 1) and the SOC Runner
  API (phase 2) both call it, and nothing else writes check results.
- Validation follows the skill's `references/word-output.md`: `mode` must be full_audit; options must include
  evidence_support and tor_decision; every target row needs `row`, `item`, `reference_check`, `detail`, plus the
  required fields of each option; every row's item must belong to the given major item. The import rejects the
  whole file on any error. It never imports part of a file.
- On re-import of a major item, the previous rows for that item are replaced in one transaction, and the
  replaced rows are copied into an audit event. If any replaced row had a Final Decision, the import requires
  an explicit "replace confirmed rows" flag, and without it returns a warning that lists those rows.

**SOC Runner API (seam 2)**

- Token-authenticated HTTP endpoints, in the style of the project-card ingest API. Each SOC Runner link has its
  own token, bound to exactly one user. Only a hash is stored. An admin can revoke it.
- Operations:
  - heartbeat (runner version, Claude login state);
  - claim the next Check Request belonging to the token's user, oldest first;
  - download the job's SOC, evidence and the current skill package (with its version);
  - report progress, `needs_documents` (with the missing names), `paused_quota` (with the expected resume
    time), `failed` (with a reason) or `needs_login`;
  - submit results, which calls the import module.
- A token can never claim, read or report on another user's Check Request.
- If a claimed request stops getting heartbeats for a set time, it returns to `requested` so that it can be
  picked up again by the same user's runner.
- The server stores the SOC skill as versioned packages uploaded by an admin. Exactly one is current.

**SOC Runner (seam 3), phase 2**

- A Python program, packaged as a Windows executable, following the `SOC_Builder.exe` precedent. Its core is
  "carry out one Check Request" with two injected adapters: the server client and the Claude CLI runner.
- It runs `claude -p` headless, under the reviewer's own login, with the downloaded skill. It checks one major
  item per Claude session.
- The skill's step 0 (missing cited documents) must not stop and ask a question in headless mode. The skill
  package served to runners includes a headless instruction: report the missing documents as a structured
  result and stop. The runner turns that into `needs_documents`. When the reviewer chooses
  [ตรวจต่อโดยไม่มีไฟล์นี้], the request is re-issued with that acknowledgement.
- Quota exhaustion from the CLI becomes `paused_quota` with a resume time. The runner retries on its own after
  that time. Rows finished before the pause are not lost.
- It polls the server. It doesn't open a listening port.
- Installer: per-user install into the user profile, with no admin rights at any step. It bundles the
  runtime, installs Claude Code silently (plus a portable Git if Claude Code needs it on Windows), registers
  per-user autostart, and opens the Claude sign-in once. The download is generated for the signed-in web user
  and carries their runner token, so there is no pairing step.

**Review page**

- Replaces the current `/soc/[id]` layout. It shows one row per SOC row with the overall status, sorted by
  problems first, with a filter by status and by major item. A row expands to show the axes with Thai labels.
  A side panel shows the rendered cited PDF page with its highlights, next to the TOR text, the bidder's text,
  the Declared Selection and the System Recommendation. The exact layout is chosen from a `/prototype` of 2–3
  options before it is built.
- There is no bulk confirm.

## Testing Decisions

- A good test drives a seam from the outside and checks what a user or another component would observe:
  stored rows, returned errors, states on a major item, audit events, HTTP responses. Tests never check
  internal helper calls or query shapes.
- **Seam 1, import:** use Node's built-in test runner (`node:test`). This repo has no TypeScript test setup
  today, so this adds no dependency. The tests run against a disposable test database, or against the import
  logic behind a narrow store interface. Cases:
  - a valid file imports;
  - each required-field and mode/option error is rejected, and nothing is written;
  - rows from another major item are rejected;
  - a re-import replaces rows and writes an audit event;
  - a re-import over confirmed rows warns without the flag and succeeds with it;
  - skill version and model are stored.
  Fixtures come from real `results.json` outputs in `soc-compliance-check/out_sonnet`.
- **Seam 2, runner API:** the same runner. Cases:
  - a token for user A can't claim, download or report on user B's request;
  - a revoked token is refused;
  - claim order is oldest first;
  - each state report moves the major item to the right state;
  - submit goes through the import (it shares seam 1's validation);
  - a stale claim returns to `requested`.
- **Seam 3, SOC Runner core:** Python `unittest`, following `soc-worker/test_worker.py`, with a fake server
  client and a fake Claude CLI. Cases:
  - happy path submits results;
  - a missing-documents output reports `needs_documents` and doesn't run the rows;
  - quota exhaustion reports `paused_quota` and resumes after the time;
  - an expired login reports `needs_login`;
  - the skill package is fetched and its version is recorded.
- **Not unit-tested:**
  - the review page: chosen by prototype, then checked in a browser against a real imported job;
  - the installer: checked by hand on a company PC without admin rights, including the SmartScreen path and
    autostart after reboot.
- Validation for every change follows AGENTS.md: `npm run lint`, `npm run typecheck`, and `npm run build`
  where it applies.

## Out of Scope

- Running Claude, or any model, on the server, including the existing `soc-worker` AI/OCR providers. They
  stay disabled for imported jobs.
- Any rule-based or deterministic compliance pre-check on the server (decided 2026-10-06).
- Auto-pass, or any affordance that turns a System Recommendation into a Final Decision without a human.
- SOCs in Excel. Only Word SOCs (`tor-word-compliance-check`) are in scope.
- Running a Check Request on someone else's machine or quota.
- A signed installer. Buying a code-signing certificate is a separate decision, depending on IT's answer.
- macOS/Linux runners.
- The SOC table builder (ADR 0002 build kind), which is a separate, paused effort.
- Removing the legacy server-side checker code. It is left as is.

## Further Notes

- **Before implementing:** the repo is on `codex-wip/admin-soc-2026-08-28` with a large set of uncommitted SOC
  changes (worker, actions, UI, compose, benchmark). See the memory note on git hygiene: never
  `git add -A`. Decide with the user which of that WIP this work builds on before the first ticket touches
  SOC files.
- **Before phase 2:** the user must ask IT whether AppLocker/WDAC blocks programs in user folders, and whether
  an unsigned installer is acceptable or can be allowlisted. If AppLocker/WDAC blocks it, the per-user install
  can't work without an IT exception.
- **To verify at the start of phase 2:** whether Claude Code on Windows still needs Git for Windows, and how
  `claude -p` reports quota exhaustion and an expired login. The runner's state mapping depends on this.
- **Unmeasured:** accuracy of the newer skill version (with step 0) in full mode, and real quota use per major
  item on a Pro plan. Measure both on one real SOC early in phase 1.
- **Phasing:**
  - Phase 1: import module, manual upload, major items, the new review page, and the overall status. It is
    useful on its own.
  - Phase 2: Check Requests, the runner API, skill hosting, the SOC Runner, and the installer.
