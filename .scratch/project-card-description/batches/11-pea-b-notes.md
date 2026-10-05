# Batch 11 (PEA B) — reading notes

Written 2026-10-05: 24 of 32 cards (write-local: updated 24, rejected 0) from `11-pea-b.json`. The 8 IdeaHub cards
are prepared in `11-pea-b-ideahub.json` but NOT written yet (see below). Per-card source file is in each `note`.
Share read-only, as in batch 10.

- **Almost every TOR and contract is a scan.** Text TORs: PEA052 (`TOR MA IP Access NE R6.docx`), PEA062
  (`ข้อกำหนดเฉพาะงาน (Specific Requirement).docx`), PEA078 (`2.1 ข้อกำหนดและเงื่อนไข ภาคอีสาน 69 final.docx`),
  PEA082 (e-bidding document 2569). Everything else: page 1 of the Contract / PO / work order rendered and read.
- Sources (24 written): `tor` 4, `contract` 20. IdeaHub file: `contract` 5, `name` 3 (PEA072/076/077 POs not read).
- **Families**
  - IP Access Network: PEA049 (Nokia 7750 SR-7 / 7705 SAR-8 / 7250 IXR-R6 + Vertiv NetSure), 057 (Nokia 7705
    SAR-8 + Vertiv/Vision DC), 078 (Nokia 7250 IXR-R6 / 7705 SAR-8) → supply + installation; MA contracts 052 (NE)
    and 053 (North + South) → ma; 056 SFP transceivers → supply. All ip-network.
  - Teleprotection: 050, 060, 085 (DIMAT TPU-1 + ECI NPT-1022), 063 (AMETEK BB FOCUS — a new brand), 083 (DIMAT +
    fibre cable to EGAT Lamphura, tag fiber-optic).
  - Microwave (DMRL): 054 (Huawei, HQ DC ↔ DRC Rangsit), 062 (Huawei OptiX RTN 950, HQ ↔ EGAT Nong Chok),
    084 (backup links for gateway nodes, Central Areas 1–3). → microwave-radio.
  - Digital radio: 051 (Kenwood KAS-20 dispatch console), 058 (hire-purchase with service, South → rental +
    managed-services), 089 (IL Consortium ICN + Loxley SI: Kirisun KiTalk Pro PoC, KiNET, TM840, Hytera PDC680),
    061 relocation, 048/074/086/087 repair/MA → microwave-radio.
  - Spare-stock OFC: 059, 082 → fiber-optic, supply.
- PEA070's Project Folder exists but is empty.

## Questions for the user

- **IdeaHub meeting displays (PEA055, 064, 066, 070, 072, 073, 076, 077) fit no Category.** User 2026-10-05: add a new
  Category on production. Prepared with value `video-conferencing` (English label "Video Conferencing" → that value;
  Thai suggestion "ระบบประชุมทางไกล"). Once an admin adds it on production, mirror the same row into pilot-db, then
  `write-local.mjs 11-pea-b-ideahub.json`. If the label differs, change `category` in the file to the derived value.
