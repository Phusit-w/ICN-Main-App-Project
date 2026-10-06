# 05: Import one Local Check Run (seam 1)

**What to build:** On a major item, a user uploads the `results.json` and `SOC_Check` document from a Claude Code run. One import operation validates the file against the skill's `word-output.md` rules: full_audit mode, both evidence_support and tor_decision options, the required fields per row, and every row belonging to that major item. If anything is wrong, the whole file is rejected with Thai reasons and nothing is written. If the file is valid, every axis the skill produces is stored per row, together with the major item, skill version, model and source (manual), and the major item becomes `checked`. Progress updates. This is the only code path that writes check results; ticket 13 reuses it. Rows can be shown in a plain list for now (the real review page is ticket 08).

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 04

**Status:** done

- [x] A valid real fixture (from ticket 02, or `soc-compliance-check/out_sonnet`) imports, and all axes are stored
- [x] Each validation rule has a test proving rejection with nothing written
- [x] Rows from another major item are rejected
- [x] Skill version, model and source are stored and shown
- [x] Progress moves to 1/N
- [x] An audit event is written; lint, typecheck and build pass

## Comments

### 2026-10-06: done (commit on `feature/soc-reviewer-run-check`)

What was built:
- `lib/soc-import.ts`: `importLocalCheckRun(actor, { jobId, majorItemId, results, socCheck, run: { skillVersion, model, source } })`. It is the only writer of check results, and ticket 13 calls it with `source: "runner"`.
  - It returns `{ ok: true, runId, rowCount }`, or `{ ok: false, errors }` with every problem in Thai. When it rejects, nothing is written and no file is stored.
  - `validateLocalCheckRun()` mirrors the skill's `append_results_to_docx.py` `validate()` for full_audit + evidence_support + tor_decision.
  - It also rejects these, which the skill does not check:
    - rows outside the major item;
    - duplicate or non-integer `row`;
    - an `item` that is not an item number;
    - a blank skill version or model;
    - a SOC_Check file that is not a .docx.
- Schema (migration `20261006150000_soc_check_runs`):
  - New `SocCheckRun` table: one row per import, holding the major item, source, skill version, model, the `RUN_OUTPUT` SOC_Check document (FK) and the importer.
  - `SocCheckResult` gains `majorItemId`, `runId`, every full-mode axis column and `rawResult` (the row exactly as it appears in results.json).
  - `SocMajorItem.runSource` added.
- Where the skill's fields go: `reference_check`, `heading_title_check`, `product_identity`, `content_relevance`, `detail` and `confidence` fill the legacy `ai*` columns. For imported rows, `final*` stay `""`: the Final Decision is still to be designed in ticket 08.
- Concurrency: the transaction first does a conditional `updateMany` that moves the item from not-checked to `checked`. Of two racing imports only one wins; there is a test for this, and it fails without the guard.
- `POST /api/soc/jobs/[id]/major-items/[itemId]/import` (multipart: `results`, `socCheck`, optional `skillVersion`/`model`). If the form leaves skill version or model empty, the file's top-level `skill_version`/`model` is used.
  - 201: imported.
  - 422 `{ errors }`: the file is invalid.
  - 400 `{ error }`: a file is missing.
  - 403/404: access.
- Audit: a `RUN_IMPORTED` SocAuditEvent is written in the same transaction, plus an `SOC_RUN_IMPORTED` AuditLog entry.
- UI (job page):
  - each `not_checked` major item has a "นำเข้าผล" form;
  - the "ตรวจโดย" column shows user · model · skill · source, with a link to the SOC_Check document;
  - an "ผลตรวจที่นำเข้า" list mirrors the skill's 6 result columns, plus Comply/Better.
- `updateSocResult` refuses imported jobs (the legacy editor).
- Fixtures: `test/fixtures/soc/results_sonnet.json`, a copy of `SOC-model-bench-2026-09-04/results_sonnet.json` because `soc-compliance-check/out_sonnet` does not exist, and `SOC_Demo.docx`. Tests filter the run to major item ๑, which has 7 rows.
- Checked in a browser on local dev with the ticket 04 SOC_Demo job:
  - a `mode: standard` file showed the Thai reason;
  - ข้อ ๑'s rows uploaded into ข้อ ๒ listed all 7 "ไม่ได้อยู่ในข้อใหญ่ ๒";
  - the valid import moved progress to 1/4 and showed the rows.

Notes for later tickets:
- **06:** importing an item whose `state === "checked"` is refused ("มีผลตรวจแล้ว"). Lift this when adding replace and the confirmed-rows flag. The race guard keys on `state`.
- **08:**
  - imported rows have `socText: ""` and `referencePages: []`, so join TOR text from the SOC docx by `rowNumber`;
  - add separate Final Decision and note columns rather than reusing `final*`;
  - `SOC_AXIS_VALUE_LABELS` (lib/soc-shared.ts) holds the Thai labels.
- **13:** pass the token's user as `actor`, because `ranById` and `importedById` come from it.
- AuditLog is written after the commit, the same pattern as `createImportedSocJob`. If it fails, the caller gets an error even though the import is stored.
