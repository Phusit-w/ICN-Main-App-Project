# Batch 13 (CAT) — reading notes

Written 2026-10-05: all 44 cards from `13-cat.json` (write-local: updated 44, rejected 0). Share read-only; Word files
were copied to the scratchpad and converted there (Word COM, read-only open), never edited on the share.

- **Sources:** `contract` 22 (CAT001–023, no Project Folder), `tor` 22 (CAT024–044).
- **Every TOR and contract PDF is a scan.** Text TORs: CAT024, CAT025, CAT035, CAT043. For the rest the TOR text came
  from the Word version of the official TOR (CAT028, 036, 037, 039, 040 draft, 042, 044) or from ICN's SOC, which
  reproduces the TOR verbatim (CAT026/027/030–032 S2, CAT029/034/036-1/041 A1, CAT033 S1, CAT038 invitation SOC) —
  same rule as batch 07 (NT029 etc.). CAT001–023: page 1 of the Contract / PO rendered and read.
- **Families**
  - DWDM / SDH / OTN supply and capacity expansion (transmission): CAT002–011, 016, 018, 020–022, 024, 036, 036-1,
    042; backhaul to submarine cable stations: CAT019, 040, 043 (+ MA CAT041); VPOP / POP Singapore–Hong Kong:
    CAT029, 034, 044.
  - NMS: MA CAT028, 039; new Nokia NMS CAT037 (transmission + tag telecom-core, as NT008).
  - Fibre CM/PM (ICN–SVOA JV for 017/023/026/027): CAT017, 023, 026, 027, 030–032 (fiber-optic / ma).
    CAT017/023 have no TOR — fibre scope inferred from the same series' TORs.
  - Other: CAT001 access node (ip-network + fiber-optic, like AIT004), CAT012 microwave 50 hops, CAT013 MDM +
    CAT033 MA AOTA/DMC (telecom-core + software), CAT015 Huawei ATN IP RAN (ip-network + transmission),
    CAT025 USO Zone C NE3 (ip-network + fiber-optic, like PIS004), CAT035 850 MHz filters, CAT038 COVID hospital ICT.

## Questions for the user (Claude's calls, change if you prefer)

- **CAT035** (850 MHz filters on mobile sites + drive test + rooftop masts) → `mobile-base-station`. Alternative:
  `microwave-radio` (radio/RF work).
- **CAT038** (COVID ICT for 4 hospitals: CCTV, patient surveillance, intercom, LINE chatbot, data registry,
  teleconference, firewall) → `medical`, tags smart-city-security, software, video-conferencing.
- **CAT025** (USO Zone C NE3 turnkey) → Work Types supply + installation only. If the contract also covered running
  the service for some years, add `managed-services` / `ma`.
