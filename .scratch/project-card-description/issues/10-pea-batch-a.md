# 10: Data batch: PEA batch A

**What to build:** Every card in this batch (the first ~32 PEA cards by Project Code, as assigned in the worklist, including subcontracted `PEA (...)` cards; most PEA folders carry no code in their name, so rely on the worklist's matching) gets a Thai/English Description with its Description Source, a Category, Tags, Work Types and (where matched) a Project Folder, written to `pilot-db`, reviewed by the user in the local web app, then pushed to production. Follow the spec's "Reading pipeline": Description Source order TOR -> Proposal -> Contract -> name only; read the `PS` share read-only (extract archives to a local scratch folder, never on the share); never send documents outside this workstation; never invent a Category, Tag or Work Type — use only entries in the list admins keep on production, mirrored into `pilot-db` first (ticket 15, "Two databases"). Update the worklist as each card moves through `written` -> `reviewed` -> `pushed`.

**Blocked by:** 07 (NT batch A, pilot)

**Status:** ready-for-agent

- [x] Every card in the batch has Description TH/EN (2-4 sentences: type of work + main system + likely search synonyms), Description Source, exactly one Category, Tags (0+) and Work Types (1+) in `pilot-db`
- [x] Ambiguous Project Folders left blank with candidates listed, and projects that fit no Category listed; both handed to the user, not guessed
- [x] Worklist rows updated to `written`, with any open question per card
- [x] User reviews in the local web app; corrections applied; rows set to `reviewed`
- [ ] On the user's go-ahead, the batch is exported from `pilot-db` and pushed to production through the ingest API (same flow as the 2026-10-01 272-card push; ingest key supplied by the user, never written to disk); response shows 0 rejected; rows set to `pushed`
- [ ] User spot-checks 2-3 pushed cards on production

## Comments

2026-10-05 — All 32 cards written to `pilot-db` (`batches/10-pea-a.json`, notes in `batches/10-pea-a-notes.md`); ingest updated 32, rejected 0. Nearly all PEA TORs/contracts are scans: page 1 of each Contract/PO was rendered and read, so most cards are source `contract` (tor 4, proposal 2, contract 25, name 1). Open question: PEA021 Project Folder left blank — the matched folder is a Central/Huawei job, the contract is Northeast/Nokia. Every card fits a Category. Next: the user reviews in the local web app.
2026-10-05 — PEA021/PEA022 Project Folders set to the NE pre-project folders `_Pre - Project\_IP_ACCESS_NE_files\Y62_IP_Access_Expansion` and `\Y63` (user answers). User reviewed the batch in the local web app ("ตรวจแล้ว"); rows set to `reviewed`. Production push is run by the user with `batches/push-prod.mjs 10-pea-a.json`.
