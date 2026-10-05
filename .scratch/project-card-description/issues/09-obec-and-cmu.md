# 09: Data batch: OBEC and CMU

**What to build:** Every card in this batch (13 cards: OBEC (11) and CMU (2); several OBEC TORs are inside .zip archives) gets a Thai/English Description with its Description Source, a Category, Tags, Work Types and (where matched) a Project Folder, written to `pilot-db`, reviewed by the user in the local web app, then pushed to production. Follow the spec's "Reading pipeline": Description Source order TOR -> Proposal -> Contract -> name only; read the `PS` share read-only (extract archives to a local scratch folder, never on the share); never send documents outside this workstation; never invent a Category, Tag or Work Type — use only entries in the list admins keep on production, mirrored into `pilot-db` first (ticket 15, "Two databases"). Update the worklist as each card moves through `written` -> `reviewed` -> `pushed`.

**Blocked by:** 07 (NT batch A, pilot)

**Status:** done

- [x] Every card in the batch has Description TH/EN (2-4 sentences: type of work + main system + likely search synonyms), Description Source, exactly one Category, Tags (0+) and Work Types (1+) in `pilot-db`
- [x] Ambiguous Project Folders left blank with candidates listed, and projects that fit no Category listed; both handed to the user, not guessed
- [x] Worklist rows updated to `written`, with any open question per card
- [x] User reviews in the local web app; corrections applied; rows set to `reviewed`
- [x] On the user's go-ahead, the batch is exported from `pilot-db` and pushed to production through the ingest API (same flow as the 2026-10-01 272-card push; ingest key supplied by the user, never written to disk); response shows 0 rejected; rows set to `pushed`
- [x] User spot-checks 2-3 pushed cards on production

## Comments

2026-10-05 — All 13 cards written to `pilot-db` (`batches/09-obec-cmu.json`, notes in `batches/09-obec-cmu-notes.md`). TOR zips extracted locally only. No ambiguous folders; every project fits a Category (OBEC → Education Devices / Rental, CMU → Medical). Next: the user reviews in the local web app.

2026-10-05 — User reviewed the batch in the local web app ("ตรวจแล้ว"); rows set to `reviewed`. Production push is run by the user with `batches/push-prod.mjs 09-obec-cmu.json`.

2026-10-05 — Pushed to production by the user with push-prod.mjs: created 0, updated 13, rejected 0. Rows set to pushed. Remaining: spot-check on production.
