# Research 02: ของเดิมแต่ละ step รับอะไรและให้อะไร

Ticket: `issues/02-existing-steps-inventory.md` · researched 2026-10-29 · source = the code in this repo (read-only), plus the two skills outside it.
All paths relative to `Main_Project_Build_App/` unless marked. Line numbers are as of 2026-10-29 (working tree, uncommitted WIP included).

## Shared storage facts (all SOC pieces)

- Root: `SOC_STORAGE_ROOT`, else `<cwd>/data/soc` (`lib/soc.ts:21-23`).
- Every file is written by `storeSocFile(folder, originalName, ext, bytes)` as `<folder>/<uuid><ext>`, write-once (`flag: "wx"`), returning `storageKey`, sha256 `checksum`, `sizeBytes`, cleaned `originalName` (folder path kept, ≤240 chars) (`lib/soc.ts:454-465`, `lib/soc-upload.ts:16-22`). `resolveStorageKey` refuses keys outside the root (`lib/soc.ts:467-472`).
- Folder per owner record: a SocJob's files under `<jobId>/` (`lib/soc.ts:158-160`); a SocBuild's under `builds/<id>/` (`lib/soc-builds.ts:90`); templates under `templates/<id>/` (`prisma/schema.prisma:541-544`); skill packages under `skill-packages/` (`schema.prisma:427`).
- One server-wide OCR line (Typhoon) shared by scanned SOC, scanned TOR ต้นฉบับ and scanned build TOR (`lib/soc-ocr-queue.ts`, used at `lib/soc.ts:221-229`, `lib/soc-tor.ts:13`, `lib/soc-builds.ts:120-125`). Every scanned path needs the user's per-upload OCR confirm (`OCR_CONFIRM_REQUIRED`, `lib/soc.ts:116`) and the OCR key (`OCR_NOT_SET_UP`).
- Restart pick-up of reads and the purge timer start in `instrumentation.ts:7-16`.
- Size limits (`lib/soc-shared.ts:184-199`, `lib/soc.ts:414-424`, `lib/soc-upload.ts:8-9`):
  - SOC file ≤ 25 MB; must be .docx/.xlsx/.pdf by name and zip/PDF by magic (`lib/soc-shared.ts:165-171`, `lib/soc-table.ts:72-78`).
  - Any PDF uploaded as "EVIDENCE" kind (Datasheets, TOR ต้นฉบับ, build TOR) ≤ 120 MB each, must be a real PDF.
  - Per job: ≤ 200 evidence PDFs, ≤ 1 GB total (`evidenceSelectionProblem`).
  - Per HTTP request: ≤ 50 files and ≤ 200 MB (IIS takes 300 MB), so the browser batches (`uploadBatches`, `lib/soc-upload.ts:54-68`).
  - SOC Template ≤ 25 MB (`lib/soc-templates.ts:34`).

## 1. สร้าง SOC — SOC Build (`/soc/builds`, `lib/soc-builds.ts`, `lib/soc-builder.ts`)

- **Model**: `SocBuild` (`schema.prisma:560-596`), its own record, not a SocJob (ADR 0011). Fields: title (duplicates allowed, `lib/soc-builds.ts:49-50`), owner, status QUEUED/READING/READY/FAILED/CANCELLED, scanned, pageRanges (+ parsed pairs), pagesDone/Total, stage, warnings, rowCount, `torName`/`torStorageKey`, `templateName`/`templateStorageKey`, `outputStorageKey`, `purgeAfter`.
- **Input** (`POST /api/soc/builds`, `app/api/soc/builds/route.ts:23-45`): form `tor` (PDF, validated as EVIDENCE → ≤120 MB, line 39), `pageRanges` text ("12-40, 55-60", Thai digits OK, checked against TOR page count, `lib/soc-builds.ts:35-47`), optional `title`, and either `templateId` (shared SocTemplate) or `template` (.docx for this build only), `ocrConfirmed=1` for a scanned TOR.
- **Storage**: the build keeps its **own copies** of TOR PDF, template .docx and the draft in `builds/<id>/` (`lib/soc-builds.ts:89-103`); a scanned TOR's OCR pages go to `builds/<id>/tor-pages.jsonl` for resume (`:62-64`).
- **Processing**: text TOR → draft built synchronously, status READY (`:86`, `:97`). Scanned TOR → QUEUED, read in background by OCR for chosen pages only, then the draft is built (`:120-168`); cancel/resume keep saved pages (`:173-191`).
- **Output**: one Generated SOC Draft `SOC-<title>.docx` + warnings + rowCount (`:94`, `:157`); download only via `GET /api/soc/builds/[id]/download` (`:214-219`). The draft is read back through the real SOC table reader to prove it reads as a SOC (`lib/soc-builder.ts:9`, `:367`).
- **Retention**: hard delete 30 days after creation (`RETENTION_MS`, `lib/soc-builds.ts:25`, `:101`); purge deletes row + folder (`:223-251`), run by the 6-hourly purge (`lib/soc-trash.ts:54-63`). No trash. Manual delete by owner/ADMIN (`:230-233`).
- **Access**: owner and ADMIN only; anyone else NOT_FOUND (`authorizeSocBuild`, `lib/soc-builds.ts:201-206`); the list shows only the actor's own builds — even an ADMIN sees only their own in the list (`:208-211`). SOC Templates are shared by all SOC users; deleting is for the adder or ADMIN (`lib/soc-templates.ts:3`, `:55-62`).
- **Not built**: "ทวนข้อความ OCR" (glossary `docs/SOC-DOMAIN-GLOSSARY.md` §สร้าง SOC) has no code (no `proofread` anywhere in `lib/`, `app/`, `actions/`, `soc-runner/`).

## 2. SOC job upload / import — Imported SOC Check (`/soc/new`, `lib/soc.ts`)

- **Model**: `SocJob` kind `"IMPORTED"` (`schema.prisma:155-198`) with `SocDocument` rows (`:200-220`, types SOC | EVIDENCE | OUTPUT | PREVIEW | RUN_OUTPUT | SOC_SOURCE_PDF | TOR_ORIGINAL) and `SocMajorItem` per ข้อใหญ่ (`:272-316`). Job Title unique among live jobs, case/space-normalised (`lib/soc.ts:60-70`, `:143`); ≤160 chars (`lib/soc-shared.ts:339`).
- **Input** (`POST /api/soc/jobs`, `app/api/soc/jobs/route.ts:8-25`): `title`, `soc` (Word .docx / Excel .xlsx / PDF ≤25 MB), first batch of `evidence` PDFs with `evidencePath` (folder path kept, `lib/soc.ts:445-452`), `ocrConfirmed`. Further batches go to `POST /api/soc/jobs/[id]/evidence` (`app/api/soc/jobs/[id]/evidence/route.ts:8-17`), checked against the job's running totals (`lib/soc.ts:428-440`).
- **Per format** (`createImportedSocJob`, `lib/soc.ts:142-185`):
  - Word / Excel SOC: stored as the job's `SOC` document; `readSocTable` makes the major items; none found → refused (`:153-154`, `:18`).
  - Text PDF SOC (ADR 0009): converted to .xlsx, that .xlsx is the `SOC`, the PDF kept as `SOC_SOURCE_PDF`, `socRowPages` = PDF page per row (`:150-173`).
  - Scanned PDF SOC (ADR 0010): job made at once in status READING with only `SOC_SOURCE_PDF` + evidence (`:187-213`); OCR cells saved in `<jobId>/cells.jsonl` (`:308`); major items published as their rows finish (`:267-294`); at the end the .xlsx becomes the `SOC`, status NEEDS_REVIEW (`:299-366`). Cancel/resume `:237-258`.
- **Evidence** = Datasheets/Catalogs/letters, each a `SocDocument` type EVIDENCE under `<jobId>/` (`:160`, `:174`). Added later by **anyone who may open the job** (`lib/soc.ts:370-390`); removed one by one, refused while a runner is `running` on the job (`:396-412`). The SOC itself cannot be replaced or removed (`:392-395`).
- **Output**: a job in NEEDS_REVIEW with not_checked major items (`:165-175`); audit `SOC_CREATED`.
- **Retention**: `expiresAt` = +90 days is set (`lib/soc.ts:19`, `:167`) but **no current app code acts on it**; only the legacy `soc-worker/worker.py:436` expires jobs by it. Real retention is the trash: owner/ADMIN moves the job to trash with `purgeAfter` = +30 days (`actions/soc.ts:124-132`), then the purge deletes rows (all SOC tables cascade) and the `<jobId>/` folder (`lib/soc-trash.ts:20-49`); ADMIN can ลบถาวร earlier from `/admin/trash`. A live job is never purged.
- **Access** (`lib/soc.ts:29-50`): an IMPORTED job opens for **every user with `soc` access** (legacy CHECK jobs: owner/ADMIN); rename and trash are owner/ADMIN only (`authorizeSocJobOwner`, `:46-50`, `:83-84`; `actions/soc.ts:125`); scanned-read cancel/resume owner/ADMIN (`actions/soc.ts:134-150`). The /soc list shows all IMPORTED jobs to everyone (`lib/soc.ts:99-113`).

## 3. ตรวจ TOR ตรงต้นฉบับ — TOR Match (`lib/soc-tor.ts`, `lib/soc-tor-match.ts`, `lib/soc-tor-judge.ts`)

- **Model**: `SocTorMatch` one per job, tied to its `TOR_ORIGINAL` SocDocument (`schema.prisma:222-243`), lines in `SocTorMatchLine` (`:245-267`). A report only — never touches major items, check requests or results (`lib/soc-tor.ts:1-4`).
- **Input** (`POST /api/soc/jobs/[id]/tor`, `app/api/soc/jobs/[id]/tor/route.ts:11-20`): one TOR PDF (EVIDENCE limits, ≤120 MB), `ocrConfirmed`. Only on an IMPORTED job whose SOC is fully read (`lib/soc-tor.ts:80-81`). It compares the **job's stored SOC file** as it reads today (`compareWithSoc`, `:52-60`).
- **Storage**: TOR PDF as `TOR_ORIGINAL` in `<jobId>/` (`:90`, `:103`); scanned TOR pages in `<jobId>/tor-<documentId>.jsonl` (`:64`); read pages also cached in `SocTorMatch.pages` so a re-compare reads nothing again (`schema.prisma:233`). Attaching again replaces the old TOR, its match, and cancels an open judge request (`lib/soc-tor.ts:88-117`).
- **Output**: lines per SOC row + TOR text no row covers, with outcome, counts, warnings (`:35-46`); TOR Excel export `app/api/soc/jobs/[id]/tor/excel`. Optional Claude step "ส่งให้ Claude ตัดสิน": one `SocCheckRequest` kind `tor_judge` for lines left ความหมายต่าง/ยืนยันไม่ได้ (`lib/soc-tor-judge.ts:18-29`), run on the clicking user's own SOC Runner, result stored beside the code outcome (`:106-109`).
- **Retention**: lives and dies with the job (cascade from SocJob/SocDocument).
- **Access**: anyone who may open the job may attach, cancel or resume (`route.ts:14`; `actions/soc.ts:152-164`) and request the judge (`actions/socCheckRequests.ts:46-51`).
- **Note**: the SOC Build's TOR PDF is a different object (glossary: "TOR PDF … _Avoid_: TOR ต้นฉบับ"); nothing links a build's TOR to a job's TOR ต้นฉบับ today.

## 4. ตรวจหลักฐาน — Check Request / SOC Runner (`lib/soc-check-requests.ts`, `lib/soc-import.ts`, `soc-runner/`)

- **Models**: `SocCheckRequest` (`schema.prisma:489-539`), `SocCheckRun` (`:318-338`), `SocCheckResult` (`:340-418`), `SocRunnerLink` per user (`:450-472`), `SocSkillPackage` + `SocCurrentSkill` (`:420-448`).
- **Input / request**: a click ตรวจ / ตรวจทั้งชุด / re-check picked rows / continue without missing files (`actions/socCheckRequests.ts:11-42`) → one request per major item (`lib/soc-check-requests.ts:58-150`). Any user who may open the job may request (`actions/socCheckRequests.ts:8-13`); cancel and ตรวจต่อเลย are requester or ADMIN (`lib/soc-check-requests.ts:179-230`).
- **Who runs it**: only the requester's own runner (`CLAIMABLE` filters `requestedById: link.userId`, `lib/soc-check-requests.ts:410-416`; `claimedRequest` `:460-468`), oldest first, with the current Skill Package pinned at claim (`:424-455`). A quiet runner (2 min, `lib/soc-shared.ts:51`) loses the claim back to `requested` (`:243`).
- **Files the runner gets**: **every** `SOC` + `EVIDENCE` document of the job, for every major item (`checkRunnerView`, `:337-365`; `runnerRequestDocument` `:472-482`) — not TOR_ORIGINAL or SOC_SOURCE_PDF. The runner downloads them into its per-request `inputs/` folder keeping folder paths, checks sha256 (`soc-runner/runner.py:761-776`), and deletes the whole work folder when the request finishes (`runner.py:597-601`).
- **Evidence Packet**: before Claude, the runner runs the skill's `scripts/build_evidence_packet.py <inputs/SOC> <item> inputs out/packet` (`runner.py:615-650`), only for a single .docx/.xlsx SOC; any failure → old flow, reason kept as `packetFallback` (`runner.py:184-204`).
- **Output**: runner submits `results.json` (+ `SOC_Check.docx` for a Word SOC, none for Excel, `runner.py:778-792`) → `importLocalCheckRun` (`lib/soc-check-requests.ts:582-590`, `lib/soc-import.ts:239`) → a `SocCheckRun`, its `RUN_OUTPUT` document in `<jobId>/` (`lib/soc-import.ts:283`, `:313`), and `SocCheckResult` rows per SOC row (unique on jobId+rowNumber). Reviewers set Final Decision on the review page (`actions/soc.ts:18-75`); results Excel at `/api/soc/jobs/[id]/results-excel` (`lib/soc-results-excel.ts`).
- **Retention**: with the job (trash → 30 days → purge). Runner keeps nothing after a request.

## 5. Can a SOC job be made from a file the server already holds?

**No, not today.** The only creator is `createImportedSocJob`, called only from `POST /api/soc/jobs` with bytes from a browser upload (`app/api/soc/jobs/route.ts:18-24`; grep finds no other caller). The build page offers only ดาวน์โหลด and delete (`app/(app)/soc/builds/[id]/page.tsx:25`). ADR 0011 already names this as future work: "a later 'use this draft for a check' link is a new step (create a check job from the draft file), not a kind switch" (`docs/adr/0011-soc-build-separate-from-soc-job.md`, Consequence).
What makes it easy: `createImportedSocJob` takes `{ title, soc: {name, bytes}, evidence: [{name, bytes}] }` (`lib/soc.ts:142`), so a server-side caller can read `SocBuild.outputStorageKey` (`resolveStorageKey`) and pass the bytes; the draft is guaranteed to read with `readSocTable` (`lib/soc-builder.ts:367`). But a draft has **empty offer/reference columns** (glossary "Generated SOC Draft"), so checking it before กรอกอ้างอิง makes no sense; and a job copies every file (no shared Datasheet store: evidence is per job, write-once, per-job folder).

## 6. What the skills already do toward "which Datasheet file and page for this row"

**`soc-no-page`** (cowork skill, not in the repo or the runner package; `%APPDATA%/Claude/local-agent-mode-sessions/skills-plugin/*/*/skills/soc-no-page/SKILL.md`, two identical copies, 2026-09):
- Purpose: a SOC whose reference column names only a topic/folder, no page; "establishes candidate page numbers per item" (frontmatter, line 3; line 8).
- It is prose workflow only (no scripts), layered on `tor-word-compliance-check` (line 10, 12-14): survey SOC rows and the Datasheet folder tree and ask the user to confirm before starting (16-18); search 3 layers before not_found — TOC, multi-word full-text search, the bidder's own item labels (38-40); evidence may sit in another category's folder/file (42-44); find labels with PyMuPDF `get_text('blocks')` sorted by y (46-48); keep SOC's own Thai item numbers (20-24); writing found pages into the SOC's reference column only into a **separate copy**, original kept (76-78).
- So it is a human-in-the-loop interactive Claude procedure; the web/runner never invoke it.

**Evidence Packet builder** (`SOC model compliance/Skill/tor-word-compliance-check/tor-word-compliance-check/scripts/build_evidence_packet.py`, v2, 911 lines):
- "Prepares facts only. It never judges a row" (lines 1-3). Input: SOC .docx/.xlsx, major item, job folder, out dir (896-901).
- It **follows a reference that is already written**; it does not search for one: per row it parses the reference cell (`reference_columns`/`reference_cells` find which column, 300-357), `cited_pages` = numbers after "หน้า" (219-231), `cited_folders` = numbered folders matching dotted numbers in the reference, narrowed by "ส่วนที่ N" chapter (234-262), `cited_files` = PDFs whose name shares ≥ NAME_MATCH_SHARE of the reference's words, or the job's only PDF when a page is cited (277-291). Every file in a cited folder becomes a candidate (`build`, 708-711).
- The nearest thing to a search: per **cited** PDF, `label_index` lists every page of the whole file carrying a label numbered like the major item's rows ("P5 lookup", 518-530), and `row_items` gives the label forms a row may carry ("1.5" and "5.5.1.5", 358-369). Also `other_documents` lists non-Datasheet documents with first-page text (634-654) and `printed_number` maps PDF page ↔ printed page (419-434).
- An empty reference: an Image Row borrows the numbered row's reference above (705-710); if the SOC cites things but no row resolves to a file the build fails on purpose (751-758). A row with no reference simply gets no candidates.
- So for กรอกอ้างอิง the reusable parts are: the reference-column finder, folder/file/name matching, label extraction (`extract_pdf_highlights`) + `label_index`, and printed-page mapping — but a whole-job search over **all** Datasheets for rows without a reference does not exist yet.

## Seams where a Proposal record would attach

1. **SocBuild** — add `proposalId` (or Proposal holds `buildId`); today owner-only access (`lib/soc-builds.ts:201-211`) conflicts with "everyone sees every Proposal"; 30-day hard purge (`:25`) conflicts with a long-lived Proposal.
2. **Build → job hand-off** — a new server-side call of `createImportedSocJob(actor, {title, soc: draft bytes, evidence})` (`lib/soc.ts:142`), the ADR 0011 "use this draft" step; also the place a กรอกอ้างอิง "new SOC copy" would enter.
3. **Datasheet store** — evidence is per SocJob `SocDocument` EVIDENCE under `<jobId>/` with job limits (200 files / 1 GB) (`lib/soc.ts:160`, `lib/soc-shared.ts:189-199`); "upload once per Proposal, shared by กรอกอ้างอิง and ตรวจหลักฐาน" needs either Proposal-owned documents copied/linked into jobs, or SocDocument rows owned by the Proposal; the runner's document API (`lib/soc-check-requests.ts:337-365`, `:472-482`) is where it would read them.
4. **TOR** — two separate TOR objects today: `SocBuild.torStorageKey` and the job's `TOR_ORIGINAL` (`lib/soc-tor.ts:74-120`). A Proposal's one TOR step would feed both (attach via `attachTorOriginal` with stored bytes).
5. **SocJob ↔ Proposal** — `proposalId` on SocJob; job title uniqueness (`lib/soc.ts:60-70`) and trash/purge (`lib/soc-trash.ts`) decide Proposal lifecycle; old jobs without a Proposal stay viewable.
6. **Check Request runner choice** — `CLAIMABLE` hard-codes `requestedById: link.userId` (`lib/soc-check-requests.ts:410-416`); a central account needs a second claim rule here (and in `claimedRequest` `:460-468`).
7. **Packet builder / กรอกอ้างอิง** — a new runner request kind (like `tor_judge`, `lib/soc-tor-judge.ts:18`) whose builder reuses `build_evidence_packet.py` helpers but searches all Datasheets for rows with an empty reference.

## Open / unverified

- Whether `soc-worker` (the only reader of `SocJob.expiresAt`) still runs on prod — memory says the old worker WIP is parked; not checked on the server.
- `soc-no-page` copies are 2026-09; a newer version elsewhere was not found.
