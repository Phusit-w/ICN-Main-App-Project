# 08: Build the new review page

**What to build:** Replace the `/soc/[id]` layout for imported jobs with the layout chosen in ticket 07. Each row shows its overall status, derived when read and never stored. Problem rows come first. Rows can be filtered by status and by major item. A row expands to show every axis with Thai labels. A reviewer sets the Final Decision and a note per row, stored separately from the System Recommendation. Any `soc` user may confirm, including the person who ran the check. There is no bulk confirm. A banner shows on major items checked with missing documents. The PDF side panel is ticket 09; leave a slot for it.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05, 07

**Status:** done

- [x] The overall status follows the rule agreed in ticket 07, and a test covers the derivation
- [x] The ordering and both filters work
- [x] A Final Decision plus note saves, is audited, and is shown separately from the recommendation
- [x] No affordance confirms more than one row at a time
- [x] A major item shows `confirmed` when all its rows have a Final Decision
- [x] Checked in a browser against a real imported job; lint, typecheck and build pass

## Comments

### 2026-10-06: note from ticket 06

A re-check warns before replacing rows with a Final Decision, and it decides that by `reviewedAt !== null` (`hasFinalDecision` in `lib/soc-import.ts`). Whatever columns this ticket adds for the Final Decision, setting one must also set `reviewedAt`/`reviewedById`. Add a test that a row decided through the new page makes a re-check answer 409.

### 2026-10-07: note from ticket 07

- Build layout **A** (table + inspector on the right).
- The status rule, the Thai axis labels and the reference code are in 07's Comments and on branch
  `prototype/soc-review-page`.
- Imported rows have no TOR text or page numbers yet (`socText` is "", `referencePages` is []); fill them as part of
  this ticket.

### 2026-10-07: built (layout A)

- **What was built:**
  - `/soc/[id]` for imported jobs now shows the review panel (`components/SocReviewPanel.tsx`) in place of the plain
    imported-rows table. It has a table plus a sticky inspector, status chips with counts, a major-item select, and the
    missing-documents banners.
  - Rule and helpers live in `lib/soc-review.ts` (client-safe): `overallRowStatus` (07's rule, ported from the
    prototype), the order, the filters, `parseReferencePages`, the Final Decision values and `majorItemConfirmed`.
  - `lib/soc-review-view.ts` builds what the page reads.
  - A Final Decision is set with the `decideSocRow` action (`actions/soc.ts`):
    - any `soc` user may set it, including whoever ran the check, one row at a time;
    - it stores `finalDecision` + `finalNote` and sets `reviewedAt`/`reviewedById`;
    - it writes a `ROW_DECIDED` SocAuditEvent (with the previous decision and the recommendation) plus `SOC_ROW_DECIDED`
      in the AuditLog.
  - A re-check over a decided row answers 409 (tested).
  - Migration `20261007120000_soc_final_decision` adds the nullable columns `proposalText`, `finalDecision` and
    `finalNote`.
  - The import now fills `socText` (TOR), `proposalText` (bidder) and `referencePages`:
    - the text comes from the job's SOC docx (`socRowTexts` in `lib/soc-major-items.ts`), matching the row number
      when its item agrees, otherwise the item number only if it is unique;
    - the page numbers are parsed from `reference`.
- **Decisions:**
  - Heading rows aren't listed and don't need a Final Decision.
  - A major item is `confirmed` when every non-heading row is decided. "Decided" means `reviewedAt !== null`, the same
    test a re-check uses.
  - `confirmed` is shown on the job page only. The `/soc` list progress still counts `checked`.
  - Status labels follow 07 (ไม่ผ่าน / ต้องตรวจ / ผ่าน). Story 25's wording (ไม่พบปัญหา / ต้องดู / มีปัญหา) was not
    used. Change it in `SOC_ROW_STATUS_LABELS` if the user prefers it, since "ผ่าน" also names a Final Decision.
  - Rows imported before this change keep empty TOR text and no pages (there is no backfill). Re-check the item to
    fill them.
- **Left for 09:** the inspector has a `data-slot="pdf-evidence"` placeholder showing the reference and its pages.
  `evidenceDocumentId` is still not set on imported rows. 09 must match the reference's document name to an
  evidence PDF.
- **Verified:**
  - 140/140 tests pass;
  - lint, typecheck and build pass;
  - browser check on "Ticket 04 browser check (SOC_Demo)" in pilot-db:
    - imported item ๓ by manual upload;
    - TOR/bidder text and pages showed;
    - order ❌ → ⚠️ → ✅, and the ⚠️ filter worked;
    - decided ๓.๓.๑ (ไม่ผ่าน + note) and ๓.๒, after which item ๓ showed ยืนยันแล้ว.
- **Review notes (/code-review):** fixed:
  - the single "decided" test;
  - the NEEDS_REVIEW guard;
  - logging an unreadable SOC;
  - the stricter row lookup;
  - the banner shown without rows;
  - `confirmed` handled in `majorItemStateText`;
  - field names `declaredSelection`/`systemRecommendation`.
- **Glossary gap (older than this ticket):** `docs/SOC-DOMAIN-GLOSSARY.md` doesn't define Final Decision, System
  Recommendation or Declared Selection yet.
