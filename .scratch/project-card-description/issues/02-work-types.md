# 02: Work Types end to end

**What to build:** A staff member sees a card's Work Types (supply, installation, MA, managed services, rental, system development; one or more) in the popup, can change them there, and finds cards by typing a Work Type (e.g. "MA" lists every project that included MA). The ingest API accepts Work Types, validates them against the fixed list, and applies the same person-edited protection as Category/Tags (one marker covers Category, Tags and Work Types). See the spec in this folder and the Work Type glossary entry.

**Blocked by:** 01 (Category and Tags end to end)

**Status:** done

- [x] Additive migration adds the Work Types field (empty by default)
- [x] Work Types fixed list (with Thai/English labels) lives in the same shared module as the Categories
- [x] Ingest POST accepts optional Work Types; unknown or duplicate values are rejected per record; merge rules identical to Category/Tags (preserve-if-blank, skip if person-edited)
- [x] Popup shows and edits Work Types (multi-select); changing them marks the classification as edited by a person
- [x] Free-text search matches Work Types (e.g. "MA", "บำรุงรักษา", "rental", "เช่า")
- [x] Scripted ingest check extended for Work Types; passes
- [x] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass

## Comments

2026-10-02 — Done. Migration `20261002090000_project_card_work_types` (applied to `pilot-db` only; production gets it in ticket 06). `WORK_TYPES` (values `supply`, `installation`, `ma`, `managed-services`, `rental`, `system-development`, Thai/English labels) live in `lib/project-card-taxonomy.ts` beside `CATEGORIES`. Ingest validates (`validateWorkTypes`) and merges with the same preserve-if-blank / skip-if-person-edited rules; a Work-Types-only push to a person-edited card counts in `skippedPersonClassification`. Popup shows Work Types and edits them as toggle chips; a real change flips `classificationEditedByPerson`, an unchanged save doesn't. Search: `matchWorkTypes` — Latin 1–2 letter queries must be a whole word so "MA" doesn't also list Managed Services; 3+ letters match a word prefix; Thai matches anywhere in the Thai label. Scripted check now 15 checks, all pass. Browser-checked with a temp user and ZZTEST cards (MA / บำรุงรักษา / rental / เช่า / managed each find only the right card; edit + unchanged save verified in DB), both deleted afterwards.
