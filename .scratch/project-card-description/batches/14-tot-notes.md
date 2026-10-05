# Batch 14 (TOT) — reading notes

Written 2026-10-05: all 47 cards from `14-tot.json` (write-local: updated 47, rejected 0). Share read-only; Word files
were copied to the scratchpad and converted there (Word COM, read-only open), never edited on the share.

- **Sources:** `tor` 8 (the cards with a Project Folder), `contract` 21, `name` 18 (only a TOT/NT work certificate
  exists).
- **Every TOR, contract and certificate PDF is a scan.** TOR text came from ICN's SOC technical requirement, which
  reproduces the TOR (TOT037, 041, 044, 046, 053, 054), or from the Word TOR (TOT045 Final v1.9, TOT051 draft V5),
  same rule as batch 07. Contract cards: page 1 / cover rendered and read; it mostly repeats the project name.
  Certificate cards: certificate rendered and read; it adds brand, item count, period and sometimes partners.
- **TOT035 / TOT036:** the certificate only says "ขยายระบบ OM / SAAM". The meaning (OM = Order Management, SAAM =
  Service Activation AtOnce Management, TOT mobile + MVNO BSS) comes from the TOT MA OM / MA SAAM TORs in
  `Proposal\2020\TOT_X_MA_OM` and `TOT_X_MA_SAAM` (later MA bids, not these cards) — used as context only, source stays
  `name`, no Project Folder.
- **Families**
  - Transmission spare parts (supply): TOT002, 003, 005, 009, 010, 012, 013, 018, 029, 030, 038; equipment 031, 047, 049.
  - Microwave: spares TOT004, 014, 048 (supply); links TOT007 Satun islands, TOT016 Ko Pha-ngan–Ko Tao (+installation).
  - DWDM / regional / backbone build-outs (transmission, supply + installation): TOT006, 026, 032, 040, 042, 050, 056;
    sync TOT027, NTP TOT055.
  - MA core switch + spare management, 3G transport (transmission + tag ip-network / ma, as NT014): TOT008, 034, 043,
    052 — the TOT predecessors of NT014/029/042/055.
  - Mobile RAN (mobile-base-station / ma): TOT020 Nokia Node B/RNC repair, TOT022/023 Node B spare management.
  - Mobile core / BSS (telecom-core): TOT021 repair, TOT033 core upgrade (TTI-ICN Consortium), TOT045 DEA, TOT051
    monitoring probes; with tag software: TOT035 OM, TOT036 SAAM, TOT037 OTA, TOT044 DMS, TOT054 MA OTA.
  - IT (data-center-it): TOT041 storage, TOT046 contact centre + chatbot (tag software), TOT053 desktop PCs.

## Questions for the user (Claude's calls, change if you prefer)

- **TOT035 / TOT036** (OM / SAAM expansion) → `telecom-core` + tag `software`, like CAT013/CAT033.
- **TOT053** (desktop PCs for Service Centers) → `data-center-it`; no Category fits end-user PCs more closely.
- **TOT055** (NTP servers at 4 exchanges) → `transmission` + tag `ip-network` (timing, like TOT027 sync).
  Alternative: `ip-network`.
- **Work Types of the "จ้างเหมา…ขยาย" build-outs** (TOT006, 026, 027, 032, 033, 040, 042, 050, 055, 056) → supply +
  installation; the contract titles do not say whether equipment was included, but the values suggest it.
