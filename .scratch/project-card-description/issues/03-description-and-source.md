# 03: Description with Description Source end to end

**What to build:** Every card can carry a Thai and English Description labelled with its Description Source (TOR, Proposal, Contract, project name only, or edited by a person). A staff member sees the Description and its source label in the popup, can edit both languages there, and an edited Description is labelled "edited by a person" and is never overwritten by a later push. The ingest API requires a Description Source whenever a Description is sent and refuses `manual` from a push. See the spec in this folder and the Description / Description Source glossary entries.

**Blocked by:** 01 (Category and Tags end to end), which shares the ingest merge code and the popup form

**Status:** ready-for-agent

- [ ] Additive migration adds the Description Source field (nullable; existing blank Descriptions stay null)
- [ ] Ingest POST: a non-blank Thai or English Description without a valid Description Source (`tor` | `proposal` | `contract` | `name`) is rejected per record; `manual` from a push is rejected
- [ ] On update: if the stored source is `manual`, incoming Description and source are skipped and counted in the response; otherwise preserve-if-blank / replace-if-non-blank as today
- [ ] Popup edits Thai and English Descriptions (today only Thai is editable); saving a changed Description sets the source to `manual`; saving unchanged text does not
- [ ] Source label shown in the popup with clear wording for each value; a name-only Description is visibly marked as such
- [ ] Search keeps matching both Description languages (already supported)
- [ ] Scripted ingest check extended for Description Source rules; passes
- [ ] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass
