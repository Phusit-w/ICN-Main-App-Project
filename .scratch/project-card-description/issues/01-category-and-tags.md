# 01: Category and Tags end to end

**What to build:** A staff member sees one Category chip on every search result, can filter the search page by Category (with a per-Category count), can see and change a card's Category and Tags in the popup, and finds a card by typing one of its Tags. The ingest API accepts Category and Tags for each project, rejects values outside the fixed company list, and never overwrites a classification a person edited on the web. The fixed list (IP Network, Transmission, Fiber Optic, Microwave & Radio, Teleprotection, Telecom Core & OSS/BSS, Data Center & IT, Software, Education Devices, Smart City & Security, Energy, Medical) lives in one shared module that validation, the filter, the popup and search all read. See the spec in this folder ("Implementation Decisions") and the Category/Tag entries in the Project Card glossary.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One additive migration adds the Category, Tags and person-edited-classification fields (plus an index on Category); existing cards keep working with empty values
- [ ] Ingest POST accepts optional Category and Tags; unknown values and a Tag equal to the Category are rejected per record (reported in `errors`, other records still saved)
- [ ] On update, blank/absent Category/Tags never erase stored values; non-blank values replace them unless the card's classification was edited by a person, in which case they are skipped and counted in the response
- [ ] Popup lets a person change Category and Tags from the fixed list; saving a changed classification marks it as edited by a person; saving without changing it does not
- [ ] Search page: Category chip on each result row, Category filter beside the Client filter with counts, works together with the other filters
- [ ] Free-text search also finds cards whose Category or Tags match the query (case-insensitive against fixed-list labels)
- [ ] Scripted ingest check (throw-away test Project Codes on local dev + `pilot-db`, cleaned up afterwards) covers rejection, skip-if-person-edited and preserve-if-blank; it passes
- [ ] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass
