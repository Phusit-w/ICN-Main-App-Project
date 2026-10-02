# 03: Description with Description Source end to end

**What to build:** Every card can carry a Thai and English Description labelled with its Description Source (TOR, Proposal, Contract, project name only, or edited by a person). A staff member sees the Description and its source label in the popup, can edit both languages there, and an edited Description is labelled "edited by a person" and is never overwritten by a later push. The ingest API requires a Description Source whenever a Description is sent and refuses `manual` from a push. See the spec in this folder and the Description / Description Source glossary entries.

**Blocked by:** 01 (Category and Tags end to end), which shares the ingest merge code and the popup form

**Status:** done

- [x] Additive migration adds the Description Source field (nullable; existing blank Descriptions stay null)
- [x] Ingest POST: a non-blank Thai or English Description without a valid Description Source (`tor` | `proposal` | `contract` | `name`) is rejected per record; `manual` from a push is rejected
- [x] On update: if the stored source is `manual`, incoming Description and source are skipped and counted in the response; otherwise preserve-if-blank / replace-if-non-blank as today
- [x] Popup edits Thai and English Descriptions (today only Thai is editable); saving a changed Description sets the source to `manual`; saving unchanged text does not
- [x] Source label shown in the popup with clear wording for each value; a name-only Description is visibly marked as such
- [x] Search keeps matching both Description languages (already supported)
- [x] Scripted ingest check extended for Description Source rules; passes
- [x] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass

## Comments

2026-10-02 — Done. Migration `20261002100000_project_card_description_source` (nullable `descriptionSource`; applied to `pilot-db` only, production in ticket 06). Labels live in `DESCRIPTION_SOURCES` in `lib/project-card-taxonomy.ts`. Ingest: a non-blank Description needs `tor` | `proposal` | `contract` | `name`; `manual` is rejected; a source sent with no Description is rejected too (the two travel together, like budgetAmount/budgetSource). A stored `manual` Description is never touched and the push is counted in `skippedManualDescription`; otherwise each blank language keeps what's stored and the source is preserve-if-null. Popup edits Thai and English; a change to either (compared trimmed) sets `manual`, an unchanged save doesn't. The source label sits above the text; name-only is a peach chip ("เขียนจากชื่อโครงการเท่านั้น — ยังไม่ได้อ่านเอกสาร"). Scripted check: 23 checks, all pass (written first, ran red). Browser-checked on local with a temp user and ZZTEST cards.
