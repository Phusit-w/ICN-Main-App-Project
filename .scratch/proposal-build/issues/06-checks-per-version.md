# 06: ตรวจ TOR ตรงต้นฉบับ และตรวจหลักฐาน ต่อฉบับ

**What to build:** Starting ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน on the current SOC Version creates that version's SOC job ("<Proposal> · ฉบับ N") automatically, using the Proposal's TOR and Datasheets without copying them, and the steps link ↗ to the existing job/review pages, which work as today. A newer SOC Version or a replaced TOR shows the old result as ต้องทำใหม่ with a link to it. Spec stories 28, 37–38, 67–72.

**Blocked by:** 02, 03, 04

**Status:** done 2026-10-30 in code and tests (test/proposal-checks.test.ts, 8 tests); browser check (light/dark/narrow) NOT done; not deployed (user: no deploy until the whole Proposal build set is finished)

- [x] Lazy SOC job per SOC Version via the existing imported-job creator fed with stored bytes; job linked to Proposal + version.
- [x] The job's evidence and TOR ต้นฉบับ come from the Proposal; the Runner document API serves the Proposal's live Datasheets for such a job.
- [x] Datasheet removal refused while a Runner is running on any job of the Proposal; a removed Datasheet cited by a result stays openable from the review page.
- [x] Statuses: ยังไม่ทำ / กำลังทำ / เสร็จ from the current version's job; ต้องทำใหม่ when only an older version or the old TOR has a result.
- [x] Starting at ตรวจหลักฐาน with only uploads (SOC + Datasheets) works end to end.
- [x] Tests at seam A + runner routes (prior art `test/soc-imported-job.test.ts`, `test/soc-tor-attach.test.ts`, `test/soc-check-requests.test.ts`). Browser check.

## How it was built (2026-10-30)

- `lib/proposal-check.ts`: `ensureVersionJob` (the current ready version's job, made on first start; its SOC and the PDF a PDF SOC came from are copied, TOR and Datasheets are not), `startEvidenceCheck`, `startTorCheck` (attaches the Proposal's TOR file through `attachTorOriginal` with `shared`), `checkSteps`/`loadProposalChecks` (statuses), `removeProposalJobs` (on purge).
- `lib/soc-evidence.ts`: `jobEvidenceFiles`: a Proposal job's evidence is the Proposal's live Datasheets (`removed: true` also lists removed ones for the review page); used by the Runner request, the Runner document route, the review view, the evidence page route and `/api/soc/documents/[id]` (which also opens a Datasheet by its id).
- Migration `20261030120000_proposal_check`: `SocJob.proposalId` + `socVersionId` (unique), `ProposalDatasheet.removedAt`, and `SocDocument.storageKey` no longer unique (the TOR file is shared by the jobs of a Proposal's versions; `removeUnsharedFile` deletes a file only when no document or Proposal TOR still points at it).
- Datasheet removal: refused while any Check Request of a Proposal job is running; once any check result of the Proposal exists the Datasheet is only marked removed and its file stays (conservative: not tied to the exact file a result cites).
- Job page for a Proposal job: Datasheets listed as its evidence, add/remove of evidence PDFs refused with a note linking to the Proposal.

## Open points

- A replaced Proposal TOR's old file stays on disk until the Proposal is purged when a purged job's TOR Match cited it (job purge removes only the job's folder).
- Trashing a Proposal does not trash its SOC jobs; they stay in the old job list.
- A job in the trash blocks starting that version's check until it is restored (message says so).
