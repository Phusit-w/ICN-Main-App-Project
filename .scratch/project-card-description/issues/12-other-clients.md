# 12: Data batch: other Clients

**What to build:** Every card in this batch (~41 cards: MEA, W&W, EGAT, TKC, AIT, ATD, BBTEC, EXIM, FORTH, IEAT, IRCP, IST, ONDE, PIS, RTP, SCS, SVOA, UTEL, as assigned in the worklist; many are subcontracts, see each Budget Note for the chain) gets a Thai/English Description with its Description Source, a Category, Tags, Work Types and (where matched) a Project Folder, written to `pilot-db`, reviewed by the user in the local web app, then pushed to production. Follow the spec's "Reading pipeline": Description Source order TOR -> Proposal -> Contract -> name only; read the `PS` share read-only (extract archives to a local scratch folder, never on the share); never send documents outside this workstation; never invent a Category, Tag or Work Type — use only entries in the list admins keep on production, mirrored into `pilot-db` first (ticket 15, "Two databases"). Update the worklist as each card moves through `written` -> `reviewed` -> `pushed`.

**Blocked by:** 07 (NT batch A, pilot)

**Status:** ready-for-agent

- [ ] Every card in the batch has Description TH/EN (2-4 sentences: type of work + main system + likely search synonyms), Description Source, exactly one Category, Tags (0+) and Work Types (1+) in `pilot-db`
- [x] Ambiguous Project Folders left blank with candidates listed, and projects that fit no Category listed; both handed to the user, not guessed
- [ ] Worklist rows updated to `written`, with any open question per card
- [ ] User reviews in the local web app; corrections applied; rows set to `reviewed`
- [ ] On the user's go-ahead, the batch is exported from `pilot-db` and pushed to production through the ingest API (same flow as the 2026-10-01 272-card push; ingest key supplied by the user, never written to disk); response shows 0 rejected; rows set to `pushed`
- [ ] User spot-checks 2-3 pushed cards on production

## Comments

2026-10-05 — 35 of 41 cards written to `pilot-db` (`batches/12-other.json`, notes in `batches/12-other-notes.md`); ingest updated 35, rejected 0. 6 cards fit no Category; user chose to add two new Categories (base-station MA: WW007/009/011; satellite: RTP001, TKC002/003). They are prepared in `batches/12-other-new-categories.json` with placeholder values and wait for the entries on production + `pilot-db`. Category choices by the user: ONDE001 education-devices, PIS004 ip-network, AIT004 ip-network.
