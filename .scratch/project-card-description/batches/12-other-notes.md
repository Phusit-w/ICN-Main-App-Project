# Batch 12 (other Clients) — reading notes

Written 2026-10-05: 35 of 41 cards (write-local: updated 35, rejected 0) from `12-other.json`; the other 6 (two NEW
Categories) from `12-other-new-categories.json` after the Categories were added (write-local: updated 6, rejected 0).
All 41 written. Per-card source file is
in each `note`. Share read-only, as before (one TOR `.doc` copied to the scratchpad and read with antiword).

- **Sources (35 written):** `tor` 7 (EGAT001, IEAT001, IRCP001, MEA004–007), `proposal` 1 (EXIM001 — official TOR is a
  scan), `contract` 25, `name` 2 (AIT004, WW003 — only a work certificate exists). New-category file: `tor` 1 (RTP001),
  `contract` 5.
- Text documents: ATD001/002, FORTH004, PIS004/005 POs/work orders; TORs of EGAT001, IRCP001, MEA004–007.
  Everything else: page 1 (sometimes 2) of the Contract / PO / work order rendered and read.
- **Families**
  - Fibre MA: AIT012 (MHESI, chain MHESI → SVOA → AIT), BBT001/002 (PEA NE, UB consortium), MEA003/004/006
    (MEA Areas 1 and 3), UTEL001 (MEA Area 2). Cable supply to FORTH for MHESI MA: FORT001, FORTH003.
  - MEA cable reorganisation / underground: MEA005 (350 km), WW012 (381 km), MEA007 (UG1). MEA002 = DMS fibre network
    to FRTUs (Interlink-ICN consortium).
  - W&W framework contracts for True: fibre install/remove/repair WW005, 006, 008, 010; base-station MA WW007, 009, 011.
  - Transmission spares: ATD001 (Huawei DWDM traffic cards), EGAT003 (Huawei OSN 580 SDH), EGAT004 (ZTE ZXONE 8000
    OBA/OPA), SCS002 (NG DWDM install, CAT north), IST001 (IP core router MPLS + DWDM for PEA, ip-network).
  - Radio: EGAT001 (microwave, Huawei RTN 950 in the proposal), ATD002 (NERA microwave cards), TKC001 (RTP eLTE survey).
  - Software: EXIM001 core banking (SSI consortium with Silverlake), FORTH004 + PIS005 incident-report web apps for PEA
    radio projects (tag microwave-radio), IRCP001 NT MDM migration (telecom-core).
- Category choices by the user (2026-10-05): ONDE001 → education-devices; PIS004 → ip-network; AIT004 → ip-network
  (tag fiber-optic).

## Questions for the user

- **New Categories — DONE 2026-10-05.** Claude added both on production Admin Center (user's approval) and mirrored
  them into pilot-db (sortOrder 122, 123):
  - `mobile-base-station` — EN "Mobile Base Station", TH "สถานีฐานโทรศัพท์เคลื่อนที่": WW007, WW009, WW011.
  - `satellite-communications` — EN "Satellite Communications", TH "สื่อสารผ่านดาวเทียม": RTP001, TKC002, TKC003.
- **SVOA009** (Net Pracharat MA, Big Rock): the PO does not say fibre; set to fiber-optic + tag ip-network as Claude's
  call. Change to ip-network if the user prefers (PIS004's USO internet card went to ip-network).
- **Work Type for survey / design / project-management work** (TKC001, TKC003 → installation; TKC002 →
  managed-services): there is no "survey/design" Work Type; tell Claude if another fits better.
- **Unknown end owner:** ATD001/002 (PO from ATD only), WW005–011 (True group, as the contracts say).
