# 10: Download the combined SOC_Check document

**What to build:** A team member downloads one `SOC_Check` Word document for the whole job. It is built on the server from the latest results of every checked major item, appended to the original SOC by the skill's deterministic `append_results_to_docx.py` (not AI). Superseded runs never appear in it. Major items not yet checked are listed as not checked.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05

**Status:** done

- [x] The download contains every checked major item's latest rows and none of the replaced ones
- [x] Unchecked major items are clearly marked
- [x] The original SOC table is unchanged in the output
- [x] The download is access-checked and audited; lint, typecheck and build pass

## Comments

### 2026-10-06: done (commit `71ae97f` on `feature/soc-reviewer-run-check`)

What was built:
- `lib/soc-combined-check.ts`: `downloadCombinedSocCheck(actor, jobId)` builds the file on demand. Nothing is stored, so it is always the latest.
  - It takes every current `SocCheckResult` with a `majorItemId` (a re-check deletes the old rows, so only the latest run's rows exist), puts their `rawResult` into one full_audit results.json, and runs the skill's script on the job's original SOC.
  - A major item counts as checked when it has rows. Every other major item is listed as not checked.
  - Provenance per item (date, model, skill version) comes from the item's `SocCheckRun`.
  - It returns `{ ok: false, error }` (Thai) when no item has rows, or the job isn't IMPORTED.
- `soc-export/combine_soc_check.py` imports `build()` from `soc-export/skill/append_results_to_docx.py`, an **unchanged copy** of the skill script (sha256 in `soc-export/README.md`). After `build()` it adds a note under the skill's subtitle: "ตรวจแล้ว X/N ข้อใหญ่", one line per checked item, and "ยังไม่ได้ตรวจ … (ไม่มีผลในเอกสารนี้)" in red.
  - Env: `SOC_PYTHON` (default `python` on Windows, `python3` elsewhere) and `SOC_SKILL_SCRIPTS_DIR` (default `soc-export/skill`).
- `GET /api/soc/jobs/[id]/soc-check`: any user who may open the job.
  - 200 returns the docx (`SOC_Check-<date>-<job title>.docx`).
  - 409 `{ error }`: nothing is checked yet.
  - 401/403/404: access.
  - 500: the Python build failed (logged with stderr).
- Audit: a `SOC_CHECK_DOWNLOADED` SocAuditEvent (checked/unchecked labels, rowCount, runIds) plus an AuditLog entry.
- Job page: a "ดาวน์โหลด SOC_Check" button next to "ตรวจแล้ว X/N ข้อใหญ่", shown once at least one item is checked.
- `lib/soc-major-items.ts` now exports `readZipEntry` (used by the tests).
- `docs/DEPLOY-WINDOWS.md`: **the server now needs Python 3.12 + `python-docx==1.2.0`** (per-user install, no admin). Before ticket 04 the web server needed no Python. This is the one new deploy step.
- Tests (`test/soc-combined-check.test.ts`, skipped when Python/python-docx is missing):
  - items ๑ and ๒ imported, then ๑ re-checked: only the re-check's rows appear, ๑ and ๒ are both in, and ๓ and ๔ are listed as not checked;
  - the original SOC tables are byte-identical at the start of the output;
  - the download is audited;
  - no-access returns 403 and no audit, signed-out returns 401;
  - nothing checked returns 409.
- Not checked in a browser: no dev server was running this session. The route is covered end to end by the tests.

Notes for later tickets:
- **08:** the download shows the System Recommendation only (the skill's columns). Whether the Final Decision should also go into the document is not decided. If yes, it must not change the skill script; add it in `combine_soc_check.py` or as a separate section.
- **11:** when skill packages are hosted, point the build at the current package's `scripts/` (or pin to each item's skill version) instead of the vendored copy.
- The Docker image (`Dockerfile`, node:alpine) has no Python. Add `python3` + `python-docx` there if Docker deploy is ever used.
