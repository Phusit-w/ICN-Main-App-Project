# 02: Work Types end to end

**What to build:** A staff member sees a card's Work Types (supply, installation, MA, managed services, rental, system development; one or more) in the popup, can change them there, and finds cards by typing a Work Type (e.g. "MA" lists every project that included MA). The ingest API accepts Work Types, validates them against the fixed list, and applies the same person-edited protection as Category/Tags (one marker covers Category, Tags and Work Types). See the spec in this folder and the Work Type glossary entry.

**Blocked by:** 01 (Category and Tags end to end)

**Status:** ready-for-agent

- [ ] Additive migration adds the Work Types field (empty by default)
- [ ] Work Types fixed list (with Thai/English labels) lives in the same shared module as the Categories
- [ ] Ingest POST accepts optional Work Types; unknown or duplicate values are rejected per record; merge rules identical to Category/Tags (preserve-if-blank, skip if person-edited)
- [ ] Popup shows and edits Work Types (multi-select); changing them marks the classification as edited by a person
- [ ] Free-text search matches Work Types (e.g. "MA", "บำรุงรักษา", "rental", "เช่า")
- [ ] Scripted ingest check extended for Work Types; passes
- [ ] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass
