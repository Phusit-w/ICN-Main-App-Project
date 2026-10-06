# 06: Re-check a major item (replace with audit)

**What to build:** Importing again for a major item that already has results replaces its rows in one transaction and copies the replaced rows into an audit event. If any replaced row already has a Final Decision, the import returns a warning listing those rows, and goes ahead only after the user explicitly confirms "แทนที่แถวที่ยืนยันแล้ว".

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05

**Status:** done

- [x] A re-import replaces only that major item's rows; other major items are untouched
- [x] The replaced rows are recoverable from the audit event
- [x] A re-import over confirmed rows warns and writes nothing without the confirmation flag, and succeeds with it
- [x] Tests cover all three cases; lint, typecheck and build pass

## Comments

### 2026-10-06: done (commit on `feature/soc-reviewer-run-check`)

What was built:
- `lib/soc-import.ts`: `importLocalCheckRun()` now re-checks a major item that already has results (the ticket 05 "มีผลตรวจแล้ว" refusal is gone).
  - Inside the import transaction, `replacePreviousRows()` copies every column of the item's current rows into a `RESULTS_REPLACED` SocAuditEvent (`detail`: `majorItemId`, `majorItem`, `runId` (new run), `replacedRunIds`, `confirmedRows`, `rows`), then deletes them. Other major items are not touched. Old `SocCheckRun`s and their SOC_Check documents are kept.
  - A row "has a Final Decision" when `reviewedAt !== null` (`hasFinalDecision`).
  - If a replaced row has a Final Decision, nothing is written and the result is `{ ok: false, errors, confirmedRows: [{ rowNumber, item }] }`.
  - `replaceConfirmed` is the list of **row numbers** the reviewer agreed to replace, not a yes/no flag. A row decided after the warning isn't in the list, so it warns again.
  - The race guard changed from `state != checked` to `lastRunAt` equal to the value read (every import moves `lastRunAt`).
  - The AuditLog summary says "ตรวจซ้ำ…" and the metadata gains `replacedRowCount`.
- Route: 409 `{ errors, confirmedRows }`. The form field `replaceConfirmed` holds row numbers, comma-separated.
- Job page: a checked item has a "ตรวจซ้ำ" button. On 409 the form lists the confirmed rows with a required checkbox, "แทนที่แถวที่ยืนยันแล้ว". Not checked in a browser this session; covered by the route tests.
- Tests (`test/soc-import-check-run.test.ts`):
  - replace only this item, recoverable from the audit event;
  - warn → stale confirmation warns again → confirm;
  - route 409 → 201;
  - two re-checks racing. A mutation check showed the race tests fail without the `lastRunAt` guard.

Notes for later tickets:
- **08:** the Final Decision write **must set `reviewedAt`**, or the re-check warning silently stops firing. Add a test in 08 that a decided row triggers the 06 warning.
- The racing-import tests assume both calls read the item before either commits. That is practically always true, but not strictly guaranteed.
