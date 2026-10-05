# 11: Data batch: PEA batch B

**What to build:** Every card in this batch (the remaining ~32 PEA cards, as assigned in the worklist) gets a Thai/English Description with its Description Source, a Category, Tags, Work Types and (where matched) a Project Folder, written to `pilot-db`, reviewed by the user in the local web app, then pushed to production. Follow the spec's "Reading pipeline": Description Source order TOR -> Proposal -> Contract -> name only; read the `PS` share read-only (extract archives to a local scratch folder, never on the share); never send documents outside this workstation; never invent a Category, Tag or Work Type — use only entries in the list admins keep on production, mirrored into `pilot-db` first (ticket 15, "Two databases"). Update the worklist as each card moves through `written` -> `reviewed` -> `pushed`.

**Blocked by:** 07 (NT batch A, pilot)

**Status:** done

- [x] Every card in the batch has Description TH/EN (2-4 sentences: type of work + main system + likely search synonyms), Description Source, exactly one Category, Tags (0+) and Work Types (1+) in `pilot-db`
- [x] Ambiguous Project Folders left blank with candidates listed, and projects that fit no Category listed; both handed to the user, not guessed
- [x] Worklist rows updated to `written`, with any open question per card
- [x] User reviews in the local web app; corrections applied; rows set to `reviewed`
- [x] On the user's go-ahead, the batch is exported from `pilot-db` and pushed to production through the ingest API (same flow as the 2026-10-01 272-card push; ingest key supplied by the user, never written to disk); response shows 0 rejected; rows set to `pushed`
- [x] User spot-checks 2-3 pushed cards on production

## Comments

2026-10-05 — 24 of 32 cards written to `pilot-db` (`batches/11-pea-b.json`, notes in `batches/11-pea-b-notes.md`); ingest updated 24, rejected 0. The 8 IdeaHub meeting-display cards fit no Category: user chose to add a new Category on production; they are prepared in `batches/11-pea-b-ideahub.json` (value `video-conferencing`) and wait for that entry to exist on production and in `pilot-db`.
2026-10-05 — Category "Video Conferencing" (`video-conferencing`) added on production via Admin Center and mirrored into `pilot-db`; the 8 IdeaHub cards written (updated 8, rejected 0). All 32 cards now `written`. Next: the user reviews in the local web app.
2026-10-05 — User reviewed the batch in the local web app ("ตรวจแล้ว"); rows set to `reviewed`. Production push is run by the user with `batches/push-prod.mjs` for `11-pea-b.json` and `11-pea-b-ideahub.json`.
2026-10-05 — Pushed to production by the user with push-prod.mjs: 11-pea-b.json updated 24, 11-pea-b-ideahub.json updated 8; created 0, rejected 0. Rows set to pushed. Remaining: spot-check on production.
