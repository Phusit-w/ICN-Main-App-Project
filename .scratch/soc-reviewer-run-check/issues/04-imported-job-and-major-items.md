# 04: Create an Imported SOC Check with its major items

**What to build:** A user with `soc` access uploads one Word SOC plus evidence PDFs and gets an Imported SOC Check: a `SocJob` of the new "imported" kind (ADR 0002 pattern) that the server-side worker never picks up. The job page lists the SOC's major items (ข้อใหญ่), read from the SOC table structure, each in state `not_checked`, with progress "ตรวจแล้ว 0/N ข้อใหญ่" on the job page and on the `/soc` list. Any user with `soc` access may open the job and add evidence PDFs (Q17 = b); ADMIN keeps everything. Existing 90-day expiry and private storage apply. See the spec's "Job model".

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 01, 03

**Status:** done

- [x] Creating an imported job stores the files and creates one major-item record per ข้อใหญ่, in order
- [x] The worker ignores imported jobs (verified)
- [x] Progress 0/N is shown on the list and the job page
- [x] Another `soc` user can open the job and add an evidence PDF, and a user without `soc` access cannot (server-side check)
- [x] The creation and the evidence addition are written to the audit trail
- [x] Tests cover major-item creation and access; lint, typecheck and build pass

## Comments

### 2026-10-06: done (commit on `feature/soc-reviewer-run-check`)

What was built:
- `SocJob.kind` (`CHECK` default, `IMPORTED`) and a new `SocMajorItem` table. Migration `20261006120000_soc_imported_job_major_items`.
- `lib/soc-major-items.ts`: reads the major items (ข้อใหญ่) straight from the `.docx` (zip + `word/document.xml`, no new dependency). `majorItemKey("๑.๒.๗") === "1"` is exported for ticket 05's "row belongs to this major item" check.
- `POST /api/soc/jobs` now always creates an Imported SOC Check: it starts in `NEEDS_REVIEW` with 0/N major items. **The legacy worker queue is no longer fed by the UI.** Old CHECK jobs still work as before.
- `POST /api/soc/jobs/[id]/evidence` adds PDFs to an imported job (any `soc` user). It writes `EVIDENCE_ADDED` / `SOC_EVIDENCE_ADDED`. Legacy jobs get a 400.
- Access: `authorizeSocJob` lets any `soc` user open an IMPORTED job. Legacy jobs stay owner/ADMIN only. Trash is owner/ADMIN only (`authorizeSocJobOwner`).
- `soc-worker` `claim_job` filters on `kind = 'CHECK'`. `test/soc-worker-claim.test.ts` runs the real `claim_job` against the test schema. It is skipped if Python with psycopg is missing. It was also checked to fail without the filter.
- `confirmSocJob` and `retrySocJob` refuse imported jobs. Export is ticket 10.
- UI: the `/soc` list shows "ตรวจแล้ว 0/N ข้อใหญ่". The job page has a major-item table and a documents panel with an "เพิ่ม PDF หลักฐาน" upload. Checked in a browser on local dev with `SOC_Demo.docx`: 0/4 items, evidence upload worked.

Notes for later tickets:
- `majorItemProgress` counts only `state === "checked"`. When ticket 05/08 derives `confirmed`, make sure confirmed items still count as done.
- Known parser limits:
  - Only top-level tables with at least one dotted item number are read.
  - A SOC whose numbering **restarts** in a second table (one table per appendix) would merge the two "1"s into one major item, because `@@unique([jobId, key])` enforces one item per number.
  - Not seen in the real SOCs so far: SOC_Demo, ภาคผนวก ก. R1 and NT DWDM S2 all parse correctly.
- Evidence limits (10 files / 250 MB) apply per upload, not per job.
