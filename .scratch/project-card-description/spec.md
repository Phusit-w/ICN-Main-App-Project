# Spec: Project Card Descriptions, Categories and Work Types

Status: ready-for-agent

> สรุปภาษาไทย: เติมคำอธิบายโครงการ (ไทย/อังกฤษ) หมวดหมู่ แท็ก ลักษณะงาน และ Project Folder ให้การ์ดทั้ง 272 ใบ
> โดยอ่าน TOR → Proposal → สัญญา → ชื่อโครงการ ทำทีละชุดลูกค้า ตรวจบน local แล้ว push ขึ้น production
> และป้องกันไม่ให้ push ทับค่าที่คนแก้บนเว็บ

Vocabulary follows `app/(app)/project-card/CONTEXT.md` (Project Card, Description, Description Source,
TOR, Proposal, Category, Tag, Work Type, Project Folder, Client, Budget Note). Relevant ADRs: 0003 (no
file-level search), 0004 (plain full-text search over an AI-authored description), 0005 (push-based
ingest), 0006 (flat access control).

## Problem Statement

All 272 Project Cards on production have a blank Description, so search only matches the project name,
Client and Project Code. Project names are short and often abbreviated ("กฟภ.", "OFC", "MA"), so a user
searching "fiber", "ไฟเบอร์" or "การไฟฟ้า" misses projects that are exactly that. Many projects did several
kinds of work that the name never mentions — those details live in the project's TOR, not in the Contract
or Work Certificate under `_BID`. There is also no way to browse or count projects by what kind of work
they were (e.g. "all Teleprotection projects", "every project that included MA").

## Solution

Every Project Card gets:

- a **Description** in Thai and English (2–4 sentences: type of work + main system, plus the synonyms a
  user is likely to search), labelled with its **Description Source** — TOR, else Proposal, else
  Contract, else the project name only;
- exactly one **Category** and zero or more **Tags** from a fixed list of technology areas;
- one or more **Work Types** from a fixed list (supply, installation, MA, managed services, rental,
  system development);
- a **Project Folder** path to the project's folder in the wider archive, when one exists.

Claude reads the source documents in session (read-only on the `PS` share), one Client batch at a time,
writes the results into the local `pilot-db`, the user reviews them in the local web app, and each
approved batch is pushed to production through the existing ingest API. Anything a person edits on the
web (Description, Category, Tags, Work Types) is marked as edited by a person and is never overwritten by
a later push. The search page gains a Category filter and a Category chip on each result, and search also
matches Tags and Work Types.

## User Stories

1. As a staff member, I want to search "fiber" or "ไฟเบอร์" and find projects whose names only say "OFC" or "ใยแก้วนำแสง", so that I find relevant past projects regardless of wording.
2. As a staff member, I want to search in English or Thai and get the same projects, so that I don't have to guess the language a project was named in.
3. As a staff member, I want to search a client's full name (e.g. "การไฟฟ้าส่วนภูมิภาค") and find cards whose names only use the abbreviation (e.g. "กฟภ."), so that abbreviations don't hide projects.
4. As a staff member, I want each card to tell me in 2–4 sentences what the project actually built or delivered, so that I can tell if it is relevant without opening any files.
5. As a staff member, I want to see where a Description came from (TOR, Proposal, Contract, or project name only), so that I know how much to trust it.
6. As a staff member, I want a name-only Description to be clearly labelled as such, so that I never mistake a guess from the title for something read from documents.
7. As a staff member, I want each card to show one main Category, so that I can see at a glance what technology area the project is in.
8. As a staff member, I want to filter search results by Category, so that I can list, for example, all Teleprotection projects.
9. As a staff member, I want the Category filter to show how many projects each Category has, so that I can see the shape of the company's portfolio.
10. As a staff member, I want to see the other technology areas a project included as Tags, so that a project that is mainly IP Network but also laid fiber still shows up when I look for fiber work.
11. As a staff member, I want search to match Tags, so that typing a technology area finds projects where it was a secondary part.
12. As a staff member, I want to see each project's Work Types (supply, installation, MA, managed services, rental, system development), so that I know how ICN delivered it, not just what it was about.
13. As a staff member, I want search to match Work Types, so that I can find, for example, every project that included MA.
14. As a staff member, I want a copyable Project Folder path on the card, so that I can jump to the project's full working files (TOR, drawings, reports) on the share.
15. As a staff member, I want the Project Folder to be blank rather than wrong when nobody is sure which folder belongs to a project, so that I am never sent to the wrong project's files.
16. As a staff member, I want to correct a Description in the card's popup, so that mistakes can be fixed by whoever notices them.
17. As a staff member, I want to change a card's Category, Tags and Work Types in the popup, so that classification mistakes can be fixed without a developer.
18. As a staff member, I want my edits to stay after the next data push, so that my corrections are not silently undone.
19. As a staff member, I want an edited Description to be labelled "edited by a person", so that others know it was corrected by hand.
20. As the project owner, I want Claude to process one Client batch at a time, so that I can review a manageable number of cards (about 20–50) per round.
21. As the project owner, I want each batch written to the local `pilot-db` first, so that I can review it in the local web app before anything reaches production.
22. As the project owner, I want a list at the end of each batch of the cards whose Project Folder was ambiguous, with the candidate folders, so that I can pick the right one.
23. As the project owner, I want a list of any project whose work doesn't fit the 12 Categories, so that I decide whether to add a Category rather than Claude inventing one.
24. As the project owner, I want each approved batch pushed to production on my go-ahead, so that production improves steadily without waiting for all 272 cards.
25. As the project owner, I want a progress record in the repo showing, per card, its Project Folder, Description Source and status (not started / written / reviewed / pushed) and open questions, so that any later session can continue exactly where the last one stopped.
26. As the project owner, I want the source documents on the `PS` share only ever read, never changed, so that the company archive is never at risk.
27. As the project owner, I want no project document sent outside this workstation, so that the open question of an external AI provider stays closed for this work.
28. As the project owner, I want ICN's Proposal used only when there is no TOR, and labelled as Proposal, so that what ICN offered is never presented as what the client asked for.
29. As the project owner, I want Contract-based Descriptions for projects with no Project Folder (most old CAT/TOT projects), so that every card still gets the best Description available.
30. As the project owner, I want the ingest API to reject a Category, Tag or Work Type that isn't in the fixed list, so that typos never create near-duplicate categories.
31. As the project owner, I want the ingest API to require a Description Source whenever a Description is sent, so that no Description is ever unlabelled.
32. As the project owner, I want a push that omits Description or classification fields to leave the existing values alone, so that partial pushes are safe.
33. As a developer, I want the fixed lists of Categories, Tags and Work Types defined in one place, so that validation, the filter and the edit form never disagree.

## Implementation Decisions

- **Fixed lists (one shared module).** Categories (also used as Tags): IP Network, Transmission, Fiber
  Optic, Microwave & Radio, Teleprotection, Telecom Core & OSS/BSS, Data Center & IT, Software,
  Education Devices, Smart City & Security, Energy, Medical. Work Types: supply, installation, MA,
  managed services, rental, system development. Stored as stable machine values with Thai/English
  display labels. Validation, the Category filter, the popup edit form and search all read this module.
  Adding a Category later is an edit to this module only (no migration).
- **Schema (Project Card, one additive migration, no data loss).** New fields: `category` (nullable
  string), `tags` (string array, default empty), `workTypes` (string array, default empty),
  `descriptionSource` (nullable string: `tor` | `proposal` | `contract` | `name` | `manual`),
  `classificationEditedByPerson` (boolean, default false), `projectFolderPath` (nullable string). Index on
  `category`. Existing rows keep working with nulls/empty arrays.
- **Ingest API contract (extends the existing POST).** Optional new fields per project: `category`,
  `tags`, `workTypes`, `descriptionSource`, `projectFolderPath`. Validation: values must be in the fixed
  lists; `tags` must not repeat the `category`; `descriptionSource` is required when `descriptionTh` or
  `descriptionEn` is non-blank and must not be `manual` (only the web sets that). Merge rules on update:
  - if the stored `descriptionSource` is `manual`, incoming Description and Description Source are ignored;
  - if `classificationEditedByPerson` is true, incoming Category, Tags and Work Types are ignored;
  - otherwise blank/absent incoming values never erase stored ones (same convention as today's
    `preserveIfBlank`/`preserveIfNull`), and non-blank incoming values replace them;
  - `projectFolderPath` follows the same preserve-if-null rule.
  The response keeps its current shape and adds counts of skipped manual Descriptions and skipped
  person-edited classifications, mirroring `skippedVerifiedBudget`.
- **Web edit (extends the popup's save action).** The popup edits Description (Thai and English),
  Category, Tags, Work Types and Budget Note. Saving a changed Description sets `descriptionSource` to
  `manual`; saving changed Category/Tags/Work Types sets `classificationEditedByPerson`. Unchanged fields
  don't flip these markers. Same validation against the fixed lists as the ingest API.
- **Search page.** Category filter (select from the fixed list with per-Category counts) beside the Client
  filter; Category chip on each result row; popup shows Description Source label, Tags, Work Types and
  the Project Folder path with a copy button, like the existing Contract/Certificate paths. Free-text
  search additionally matches Tags/Work Types/Category by mapping the query to fixed-list values whose
  label contains it (case-insensitive) and matching cards that have any of them. As built (tickets 01–02):
  a Thai query matches anywhere in the Thai label; a Latin query must match the start of a word in the
  English label (so "MA" doesn't hit "sMArt"), and for Work Types a 1–2 letter Latin query must be a whole
  word (so "MA" doesn't also list Managed Services).
- **Reading pipeline (data work, Claude in session).** For each Client batch: (1) match each card to a
  Project Folder under `_Project …` on `PS` using Project Code, then project name + year + Client; when
  more than one folder fits, or a folder looks like a lost bid ("Participate", "Re-bidding" without the
  award), leave it blank and record the candidates for the user; (2) pick the Description Source in order
  TOR → Proposal → Contract (the card's existing Contract path) → name only; (3) write Description TH/EN,
  Category, Tags, Work Types, Project Folder into `pilot-db`; (4) record everything in the worklist;
  (5) after the user's review, push that batch to production with the same export-from-`pilot-db` +
  ingest-key flow used for the 272-card push on 2026-10-01. All share access is read-only; archives
  (`.zip`) are extracted to a local scratch folder, never on the share.
- **Batch order.** NT → OBEC → PEA → CMU → remaining Clients with Project Folders → CAT/TOT (mostly no
  Project Folder, Contract or name only).
- **Worklist (progress record).** A tracked file inside this feature's `.scratch/` folder, one row per
  Project Code: Client, batch, Project Folder (or candidates), Description Source, status (`todo` |
  `written` | `reviewed` | `pushed`), open question. It is the single place a new session reads to resume.

## Testing Decisions

- A good test exercises external behaviour only: what the ingest API stores and returns, and what the user
  sees on the page — not internal helpers.
- **Seam 1 — ingest API (primary).** A scripted check against the local dev server + `pilot-db` that posts
  throw-away cards (a reserved test Project Code prefix, deleted afterwards) and asserts: rejection of
  unknown Category/Tag/Work Type values and of a Description without a Description Source; a `manual`
  Description and person-edited classification survive a later push; blank/absent fields don't erase
  stored values; non-blank fields replace non-manual values; Project Folder preserve-if-null.
- **Seam 2 — web UI (manual, in the browser).** Editing Description/classification in the popup flips the
  markers and shows "edited by a person"; Category filter and counts work; searching a Tag or Work Type
  finds the right cards; Project Folder copy works.
- Default validation for every code change: `npm run lint`, `npm run typecheck`, and `npm run build`
  (this touches Prisma and production behaviour).
- No TypeScript test framework is added (the repo has none). Prior art: the scripted checks used to verify
  the client filter and the migration on 2026-10-01, and the Python `unittest` suites in
  `project-card-crawler/` if any crawler code changes.

## Out of Scope

- An automated AI provider or any document leaving the company network (Claude reads in session).
- Searching inside document contents (ADR 0003 stands).
- Cleaning the 78 Budget Notes, resolving OBEC002's missing Budget, VAT normalisation, JV totals — tracked
  in `PROJECT-CARD-BID-OPEN-ISSUES-2026-10-01.md`, separate work.
- A Work Type filter on the search page (Work Types are searchable; a filter can come later).
- Projects that exist under `_Project …` but have no `_BID` card.
- Re-reading Budgets.

## Further Notes

- Production went live with the 272 cards on 2026-10-01 (commit `5054cf2`); every push from now on goes
  through the ingest API, so the merge rules above are what protect production edits.
- Known remaining risk: pushes still overwrite a production Budget Note edited on the web when `pilot-db`
  holds a different non-blank note. Keep Budget Note edits in `pilot-db` until that is addressed.
- Facts found 2026-10-01: only 70 of 272 cards match a `_Project …` folder by Project Code; most PEA folders
  carry no code in their name; CAT (44) and TOT (47) have essentially no project folders.
