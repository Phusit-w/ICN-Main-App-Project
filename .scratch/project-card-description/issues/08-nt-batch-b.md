# 08: Data batch: NT batch B

**What to build:** Every card in this batch (the remaining ~31 NT cards, as assigned in the worklist) gets a Thai/English Description with its Description Source, a Category, Tags, Work Types and (where matched) a Project Folder, written to `pilot-db`, reviewed by the user in the local web app, then pushed to production. Follow the spec's "Reading pipeline": Description Source order TOR -> Proposal -> Contract -> name only; read the `PS` share read-only (extract archives to a local scratch folder, never on the share); never send documents outside this workstation; never invent a Category, Tag or Work Type — use only entries in the list admins keep on production, mirrored into `pilot-db` first (ticket 15, "Two databases"). Update the worklist as each card moves through `written` -> `reviewed` -> `pushed`.

**Blocked by:** 07 (NT batch A, pilot)

**Status:** ready-for-agent

- [x] Every card in the batch has Description TH/EN (2-4 sentences: type of work + main system + likely search synonyms), Description Source, exactly one Category, Tags (0+) and Work Types (1+) in `pilot-db`
- [x] Ambiguous Project Folders left blank with candidates listed, and projects that fit no Category listed; both handed to the user, not guessed
- [x] Worklist rows updated to `written`, with any open question per card
- [x] User reviews in the local web app; corrections applied; rows set to `reviewed`
- [ ] On the user's go-ahead, the batch is exported from `pilot-db` and pushed to production through the ingest API (same flow as the 2026-10-01 272-card push; ingest key supplied by the user, never written to disk); response shows 0 rejected; rows set to `pushed`
- [ ] User spot-checks 2-3 pushed cards on production

## Comments

2026-10-05 — All 31 cards written to `pilot-db` (`batches/08-nt-b.json`, notes in `batches/08-nt-b-notes.md`). 7 cards downgraded to `proposal` (no official TOR). No ambiguous folders; every project fits a Category. Open notes in the worklist (NT043–045 folder numbering vs contracts, NT066 area list). Next: the user reviews in the local web app.

2026-10-05 — The user approved the batch for production without a separate web review ("push ขึ้นเลย"); rows set to `reviewed`. Production push of 07+08 is run by the user with `batches/push-prod.mjs` (Claude's push was blocked by the auto-mode classifier).
