# Batch 10 (PEA A) — reading notes

Written 2026-10-05 (write-local: updated 32, rejected 0). Per-card source file is in `10-pea-a.json` (`note`).
Share read-only: folders listed with `Get-ChildItem`, PDFs/docx opened for reading, one zip member per TOR
zip extracted to the local scratchpad only. Category/Work Type values are all in the 12 + 6 seeded lists
(pilot-db `ProjectCardTerm`); no new entries needed.

- **Almost every PEA TOR and contract is a scan with no text layer.** Text TORs were found only for PEA027 and
  PEA041 (`2.1 ข้อกำหนดและเงื่อนไข` docx, read with tracked deletions dropped), PEA030 (table of contents) and
  PEA042 (e-bidding document). For the rest, page 1 of the card's Contract / purchase order / work order was
  rendered and read, so **Description Source is `contract` for most cards where the worklist planned `tor`**
  (downgrade allowed by the worklist rules). Equipment brands come from the contract text where it names them,
  or from the ICN proposal's catalogue / letter file names in the Project Folder (said so in the Description).
- Sources: `tor` 4 (PEA027, 030, 041, 042), `proposal` 2 (PEA029, 033), `contract` 25, `name` 1 (PEA006).
- **Families**
  - IP Access Network (MPLS router), Northeast: PEA012 (ICN–TTI consortium, 285 nodes + NMS), 021 (Nokia,
    70 nodes), 022, 027 (Nokia), 037 (Nokia 7750 SR / 7705 SAR per proposal), 041 (Nokia). → ip-network.
    E1 cards on the same network: PEA028, PEA033 (Chaiyaphum Wind Farm) → ip-network + tag transmission.
  - Teleprotection for closed-loop distribution: PEA020, 029, 032, 036, 038, 043, 046 → teleprotection;
    DIMAT TPU-1 + ECI NPT-1022 where the contract names them (032, 038, 043, 046) or the proposal does (029).
    Tag fiber-optic only where the contract includes fibre-cable installation (020, 032, 043).
  - Fibre cable installation: PEA017 (Interlink–ICN consortium, Figure-8, 164 routes / 3,140 km),
    PEA030 (ARSS, 88 routes / ~1,300 km). → fiber-optic, supply + installation.
  - Spare-stock OFC cable/accessories (supply only): PEA015, 019, 023, 026, 031, 042, 045 → fiber-optic.
    Item examples (ADSS/ARSS/Figure-8 cable, clamps, dome closure, pole hardware) are the standard PEA list,
    confirmed in the PEA030/PEA042 TOR text and PEA042/045 proposal catalogues.
  - Digital radio, PEA Area 2 Chonburi: PEA018 (Kenwood DMR simulcast per proposal), PEA035 (expansion; folder
    holds several bidders' proposals, brand not stated), PEA034 (rectifier + battery, supply), PEA039/040/047
    (relocation, installation only), PEA044 (repair → ma). → microwave-radio.
  - PEA006: Coriant bandwidth expansion, North — name only (no folder, no contract) → transmission.

## Questions for the user

- **PEA021 Project Folder** — answered 2026-10-05: the 2026-10-02 match `PEA_ IP Access Huawei 135 Nodes and 56
  Nodes` is a Central / Huawei / 135+56-node job, while contract บ.71/2563 is Northeast / Nokia / 70 nodes. User:
  don't use that folder; use a NE folder if one is found. Found
  `_Pre - Project\_IP_ACCESS_NE_files\Y62_IP_Access_Expansion` (SoR_NE_Expansion Rel.12, NE1-3 connectivity
  diagrams, "Opt Power Budget Cal -Nokia") → set as PEA021's Project Folder.
- **PEA022 (new candidate)**: the same parent holds `Y63` (NE Y63 AGG/ACC router spec, invitation docs); contract
  อบ.3/2563 is the Y63 round. Left blank pending the user.
- No card in this batch failed to fit a Category.
