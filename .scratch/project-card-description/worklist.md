# Worklist: Project Card Descriptions, Categories and Work Types

The single progress record for this feature (spec.md, "Worklist"). One row per Project Code in `pilot-db`
(272 cards). A new session resumes from this file alone.

- **Batch** = ticket number (07 NT A, 08 NT B, 09 OBEC + CMU, 10 PEA A, 11 PEA B, 12 other Clients, 13 CAT, 14 TOT).
  Subcontract cards such as `PEA (BBTEC)` are in 12, following ticket 12's Client list and count.
- **Project Folder** paths are relative to `\\192.168.99.1\PS\`; "code" = Project Code in the folder name,
  "name+year" = matched by project name, year and Client. `(proposal-archive)` = a folder under a Client's
  `Proposal\<year>\` collection rather than a project folder of its own.
- **Candidates** = more than one folder fits, or the fit isn't certain: Project Folder stays blank until the
  user picks (answer goes in the Question column, then move the path to Project Folder).
- **Planned source** = the Description Source this card is expected to get, from the folder's contents
  (a TOR found → `tor`, else a Proposal → `proposal`, else the card's Contract → `contract`, else `name`).
  Confirm when reading; the batch may downgrade it.
- **Status**: `todo` → `written` (in `pilot-db`) → `reviewed` (by the user, local web) → `pushed` (production).

Matching was done 2026-10-02, read-only against `_Project 2018-2025` and `_Project 2026` (PowerShell
`Get-ChildItem` only; nothing on the share was written, renamed or deleted).

## Summary (2026-10-02)

| | Cards |
|---|---|
| Confident Project Folder | 159 |
| Ambiguous (candidates listed, awaiting the user) | 0 |
| No Project Folder | 113 |

Planned sources: `name` 21, `contract` 95, `tor` 153, `proposal` 3.
Cards per batch: 10: 32, 11: 32, 12: 41, 13: 44, 14: 47, 07: 32, 08: 31, 09: 13.

## Cards

| Batch | Code | Client | Project Folder | Candidates | Planned source | Status | Question / answer |
|---|---|---|---|---|---|---|---|
| 07 | NT001 | NT | `_Project 2018-2025\NT\2021\NT001_MGT_RTC` — code |  | tor | pushed |  |
| 07 | NT002 | NT | `_Project 2018-2025\NT\2021\NT002_CORE_BW_EXP` — code |  | tor | pushed |  |
| 07 | NT003 | NT | `_Project 2018-2025\NT\2021\NT003_MA_OTA` — code |  | tor | pushed |  |
| 07 | NT004 | NT | `_Project 2018-2025\NT\2021\NT004_MA ITSC BKK6` — code |  | tor | pushed |  |
| 07 | NT005 | NT | `_Project 2018-2025\NT\2021\NT005_PABX BTC` — code |  | tor | pushed |  |
| 07 | NT006 | NT | `_Project 2018-2025\NT\_NT2\2022\1. BB_BKK-South` — name+year |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN compliance table only. |
| 07 | NT007 | NT | `_Project 2018-2025\NT\2021\NT007_MA_NK_EQ64` — code |  | tor | pushed |  |
| 07 | NT008 | NT | `_Project 2018-2025\NT\2021\NT008_MA_NMS64` — code |  | tor | pushed |  |
| 07 | NT009 | NT | `_Project 2018-2025\NT\2021\NT009_PCRF` — code |  | tor | pushed |  |
| 07 | NT010 | NT | `_Project 2018-2025\NT\2021\NT010_DEA_EXP` — code |  | tor | pushed |  |
| 07 | NT011 | NT | `_Project 2018-2025\NT\2022\NT011_EXP_NET_MON64` — code |  | tor | pushed |  |
| 07 | NT013 | NT | `_Project 2018-2025\NT\2021\NT013_MA_USO1_OFC` — code |  | tor | pushed |  |
| 07 | NT014 | NT | `_Project 2018-2025\NT\_NT2\2022\2. MA Transport` — name+year |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 07 | NT017 | NT | `_Project 2018-2025\NT\2022\NT017_MA_DMS65` — code |  | tor | pushed |  |
| 07 | NT018 | NT | `_Project 2018-2025\NT\2022\NT018_019_020_CM_PM65` — code |  | tor | pushed | North (นภ.) facts taken from the West/East SOCs of the same tender (its own S4 file not converted). |
| 07 | NT019 | NT | `_Project 2018-2025\NT\2022\NT018_019_020_CM_PM65` — code |  | tor | pushed |  |
| 07 | NT020 | NT | `_Project 2018-2025\NT\2022\NT018_019_020_CM_PM65` — code |  | tor | pushed |  |
| 07 | NT021 | NT | `_Project 2018-2025\NT\2022\NT021_MGT_RTC65` — code |  | tor | pushed |  |
| 07 | NT022 | NT | `_Project 2018-2025\NT\2022\NT022_SMART_POLE_Re-bidding` — user's answer |  | tor | pushed | Two folders carry NT022: the first bid or the re-bid — which one led to the contract? → **User 2026-10-02: the Re-bidding round is the one that won.** |
| 07 | NT023 | NT | `_Project 2018-2025\NT\2022\NT023_MA_NET_MON` — code |  | tor | pushed |  |
| 07 | NT024 | NT | `_Project 2018-2025\NT\_NT2\2022\3. ISP-POP` — name+year |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 07 | NT025 | NT | `_Project 2018-2025\NT\2022\NT025_DWDM_155` — code |  | tor | pushed |  |
| 07 | NT026 | NT | `_Project 2018-2025\NT\2022\NT026_MA ITSC_65` — code |  | tor | pushed |  |
| 07 | NT027 | NT | `_Project 2018-2025\NT\2022\NT027_OCS` — code |  | tor | pushed |  |
| 07 | NT028 | NT | `_Project 2018-2025\NT\2022\NT028_MA_EQ_NMS66` — code |  | tor | pushed |  |
| 07 | NT029 | NT | `_Project 2018-2025\NT\2023\NT029 MA_3G_2023` — code |  | tor | pushed |  |
| 07 | NT030 | NT | `_Project 2018-2025\NT\2023\NT030 MA_DEA66` — code |  | tor | pushed |  |
| 07 | NT031 | NT | `_Project 2018-2025\NT\2023\NT031 MA_USO1_N2` — code |  | tor | pushed |  |
| 07 | NT032 | NT | `_Project 2018-2025\NT\2023\NT032 MA_OTA66` — code |  | tor | pushed |  |
| 07 | NT033 | NT | `_Project 2018-2025\NT\2023\NT033 MA_DMS66` — code |  | tor | pushed |  |
| 07 | NT034 | NT | `_Project 2018-2025\NT\2023\NT034 5G_CORE` — code |  | tor | pushed | Equipment vendor/model not stated in the TOR; Description is generic (4G/5G 700 MHz). Add the vendor if you know it. |
| 07 | NT036 | NT | `_Project 2018-2025\NT\2023\NT036 MA_NET_MON66` — code |  | tor | pushed |  |
| 08 | NT037 | NT | `_Project 2018-2025\NT\2023\NT037 NT038_NT039_CM_PM_Y66` — code |  | tor | pushed |  |
| 08 | NT038 | NT | `_Project 2018-2025\NT\2023\NT037 NT038_NT039_CM_PM_Y66` — code |  | tor | pushed |  |
| 08 | NT039 | NT | `_Project 2018-2025\NT\2023\NT037 NT038_NT039_CM_PM_Y66` — code |  | tor | pushed |  |
| 08 | NT040 | NT | `_Project 2018-2025\NT\2023\NT040 MA_NETMON_EXP` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 08 | NT041 | NT | `_Project 2018-2025\NT\2023\NT041 MA_DEA_EXP` — code |  | tor | pushed |  |
| 08 | NT042 | NT | `_Project 2018-2025\NT\2023\NT042 MA_3G_2024` — code |  | tor | pushed |  |
| 08 | NT043 | NT | `_Project 2018-2025\NT\2023\NT043 NT044_NT045_CM_PM_Y67` — code |  | tor | pushed | Proposal folders number NT043=ภก.1/NT045=ภน.1, but the contracts in _BID say NT043=ภน.1, NT044=ภก.1, NT045=ภก.2 — followed the contracts. |
| 08 | NT044 | NT | `_Project 2018-2025\NT\2023\NT043 NT044_NT045_CM_PM_Y67` — code |  | tor | pushed |  |
| 08 | NT045 | NT | `_Project 2018-2025\NT\2023\NT043 NT044_NT045_CM_PM_Y67` — code |  | tor | pushed |  |
| 08 | NT046 | NT | `_Project 2018-2025\NT\2024\NT046 MA_DEA67` — code |  | tor | pushed |  |
| 08 | NT047 | NT | `_Project 2018-2025\NT\2024\NT047 MA_DMS67` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 08 | NT048 | NT | `_Project 2018-2025\NT\2024\NT048 MA_EQ_NMS67` — code |  | tor | pushed |  |
| 08 | NT049 | NT | `_Project 2018-2025\NT\2024\NT049 MA_OTA67` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 08 | NT050 | NT | `_Project 2018-2025\NT\2024\NT050 MA_NET_MON67` — code |  | tor | pushed |  |
| 08 | NT051 | NT | `_Project 2018-2025\NT\2024\NT051 MA_DEA_EXP67` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 08 | NT052 | NT | `_Project 2018-2025\NT\2024\NT052 NT053 NT054_CM_PM_Y67` — code |  | tor | pushed |  |
| 08 | NT053 | NT | `_Project 2018-2025\NT\2024\NT052 NT053 NT054_CM_PM_Y67` — code |  | tor | pushed |  |
| 08 | NT054 | NT | `_Project 2018-2025\NT\2024\NT052 NT053 NT054_CM_PM_Y67` — code |  | tor | pushed |  |
| 08 | NT055 | NT | `_Project 2018-2025\NT\2025\NT055 MA 3G Transport 2025` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 08 | NT056 | NT | `_Project 2018-2025\NT\2025\NT056_057_058 CCTV` — code |  | tor | pushed |  |
| 08 | NT057 | NT | `_Project 2018-2025\NT\2025\NT056_057_058 CCTV` — code |  | tor | pushed |  |
| 08 | NT058 | NT | `_Project 2018-2025\NT\2025\NT056_057_058 CCTV` — code |  | tor | pushed |  |
| 08 | NT059 | NT | `_Project 2018-2025\NT\2025\NT059_060_061 CCTV` — code |  | tor | pushed |  |
| 08 | NT060 | NT | `_Project 2018-2025\NT\2025\NT059_060_061 CCTV` — code |  | tor | pushed |  |
| 08 | NT061 | NT | `_Project 2018-2025\NT\2025\NT059_060_061 CCTV` — code |  | tor | pushed |  |
| 08 | NT062 | NT | `_Project 2018-2025\NT\2025\NT062 MA_DEA68` — code |  | tor | pushed |  |
| 08 | NT063 | NT | `_Project 2018-2025\NT\2025\NT063 MA_DMS68` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 08 | NT064 | NT | `_Project 2018-2025\NT\2025\NT064 DWDM_CLOUD` — code |  | tor | pushed |  |
| 08 | NT065 | NT | `_Project 2018-2025\NT\2025\NT065 DWDM Thailand IX` — code |  | tor | pushed |  |
| 08 | NT066 | NT | `_Project 2018-2025\NT\2025\NT066 CM_PM_Y69` — code |  | tor | pushed | TOR covers 5 areas (กน., ตน., นป., ตป., อป.); the card name lists 3 (กน., นป., อป.). Description follows the TOR. |
| 08 | NT067 | NT | `_Project 2026\NT\1. NT067_MA_USO1_Y69` — code |  | proposal | pushed | Source downgraded tor->proposal: no official TOR in folder, ICN SOC only. |
| 09 | CMU001 | CMU | `_Project 2018-2025\CMU\CMU001 COVID` — code |  | tor | pushed | Source = client-format draft TOR (TOR\Draft TOR CMU Covid …docx); the signed TOR (24 ล้าน.pdf) is a scan. |
| 09 | CMU002 | CMU | `_Project 2018-2025\CMU\CMU002 SMART_HOS` — code |  | tor | pushed |  |
| 09 | OBEC001 | OBEC | `_Project 2018-2025\OBEC\OBEC001 Tablet_สพป.เชียงราย เขต 3` — code |  | tor | pushed |  |
| 09 | OBEC002 | OBEC | `_Project 2018-2025\OBEC\OBEC002 Tablet_สพป.อุดรธานี เขต 1` — code |  | tor | pushed |  |
| 09 | OBEC003 | OBEC | `_Project 2018-2025\OBEC\OBEC003 Tablet_สพม.สกลนคร` — code |  | tor | pushed |  |
| 09 | OBEC004 | OBEC | `_Project 2018-2025\OBEC\OBEC004 Tablet_สพม.อุทัยธานี ชัยนาท` — code |  | tor | pushed | Device is a Lenovo 500e Chromebook (not a tablet) although the folder name says Tablet. |
| 09 | OBEC005 | OBEC | `_Project 2018-2025\OBEC\OBEC005 Tablet_สพป.อุบลราชธานี เขต 1` — code |  | tor | pushed |  |
| 09 | OBEC007 | OBEC | `_Project 2018-2025\OBEC\OBEC007 Tablet_สพม.จันทบุรี ตราด` — code |  | tor | pushed |  |
| 09 | OBEC009 | OBEC | `_Project 2018-2025\OBEC\OBEC009 Tablet_สพม.นครสวรรค์` — code |  | tor | pushed |  |
| 09 | OBEC010 | OBEC | `_Project 2018-2025\OBEC\OBEC010 Tablet_สพม.สุพรรณบุรี` — code |  | tor | pushed |  |
| 09 | OBEC011 | OBEC | `_Project 2018-2025\OBEC\OBEC011 Tablet_สพม.สมุทรปราการ` — code |  | tor | pushed | Device is a Lenovo 500e Chromebook (not a tablet) although the folder name says Tablet. |
| 09 | OBEC012 | OBEC | `_Project 2026\OBEC\OBEC012 Tablet_สพป.อุบลราชธานี เขต 4` — code |  | tor | pushed |  |
| 09 | OBEC013 | OBEC | `_Project 2026\OBEC\OBEC013 Tablet_สพป.อุบลราชธานี เขต 5` — code |  | tor | pushed |  |
| 10 | PEA006 | PEA |  |  | name (Work Certificate only) | pushed |  |
| 10 | PEA012 | PEA |  |  | contract | pushed |  |
| 10 | PEA015 | PEA |  |  | contract | pushed | Two 2019 spare-stock cards (PEA015, PEA019) but one Accessories 2019 folder — which card, or both? → **User 2026-10-02: accepted Claude's recommendation — blank: one TOR in the folder and PEA019 is the Accessories contract.** |
| 10 | PEA017 | PEA | `_Project 2018-2025\PEA\2019\PEA_OFC62` — name+year |  | tor (TOR in archive) | pushed |  |
| 10 | PEA018 | PEA | `_Project 2018-2025\PEA\2019\PEA_Digital trunk radio กฟก2` — name+year |  | tor (TOR in archive) | pushed |  |
| 10 | PEA019 | PEA | `_Project 2018-2025\PEA\2019\PEA_Accessories 2019` — user's answer |  | tor (TOR in archive) | pushed | See PEA015. → **User 2026-10-02: accepted Claude's recommendation — contract file is named Accessories.** |
| 10 | PEA020 | PEA | `_Project 2018-2025\PEA\2020\PEA_Teleprotection กฟก.2` — user's answer |  | tor | pushed | Main Teleprotection กฟก.2 folder or the 'add 1 node' one? → **User 2026-10-02: accepted Claude's recommendation — main folder; the +1 node folder is the Klong Mai 2 job.** |
| 10 | PEA021 | PEA | `_Project 2018-2025\PEA\_Pre - Project\_IP_ACCESS_NE_files\Y62_IP_Access_Expansion` — user's answer (pre-project folder) |  | contract | pushed | One 2020 IP Access folder (135 + 56 nodes) for two cards (PEA021, PEA022) — does it cover both? → **User 2026-10-02: accepted Claude's recommendation — contract is IP Access Expansion Y62, folder TOR is from 2562.** **Batch 10 reading (2026-10-05): folder left blank again — its TORs are for the CENTRAL region, Huawei, 135/56 nodes (selection method), but contract บ.71/2563 is NORTHEAST, Nokia, 70 nodes. Keep blank, or is there a NE Y62 folder elsewhere?** → **User 2026-10-05: keep the Huawei folder off; use a NE folder if one turns up. Found `_Pre - Project\_IP_ACCESS_NE_files\Y62_IP_Access_Expansion` (SoR_NE_Expansion, NE1-3 diagrams, Nokia power budget) → set as Project Folder.** |
| 10 | PEA022 | PEA | `_Project 2018-2025\PEA\_Pre - Project\_IP_ACCESS_NE_files\Y63` — user's answer (pre-project folder) |  | contract | pushed | **New candidate 2026-10-05: use the Y63 pre-project folder for PEA022 (contract อบ.3/2563 = Y63)?** → **User 2026-10-05: yes — set as Project Folder (pre-project folder: NE Y63 router spec + invitation docs, no submitted proposal).** See PEA021. → **User 2026-10-02: accepted Claude's recommendation — blank: contract is IP Access Y63 (อบ.3), a later round.** |
| 10 | PEA023 | PEA |  |  | contract | pushed | 2020 spare stock: the Accessories 2020 folder or one of the two เข้าคลัง folders? → **User 2026-10-02: accepted Claude's recommendation — blank: two 2020 ICN submissions (Accessories 2020 / เข้าคลัง 006-2563) cannot be told apart.** |
| 10 | PEA026 | PEA |  |  | contract | pushed |  |
| 10 | PEA027 | PEA | `_Project 2018-2025\PEA\2021\2. IP Access Y.64` — name+year |  | tor | pushed |  |
| 10 | PEA028 | PEA |  |  | contract | pushed |  |
| 10 | PEA029 | PEA | `_Project 2018-2025\PEA\2022\1. Teleprotection C3` — name+year |  | proposal | pushed |  |
| 10 | PEA030 | PEA | `_Project 2018-2025\PEA\2022\2. OFC_ARSS_1300KM` — name+year |  | tor | pushed |  |
| 10 | PEA031 | PEA | `_Project 2018-2025\PEA\2022\3. Spare OFC+Accessories Y.65` — name+year |  | tor | pushed |  |
| 10 | PEA032 | PEA | `_Project 2018-2025\PEA\2022\6. Teleprotection N1` — name+year |  | tor | pushed |  |
| 10 | PEA033 | PEA | `_Project 2018-2025\PEA\2022\7. E1 Chaiyapom 2` — name+year |  | proposal | pushed |  |
| 10 | PEA034 | PEA |  |  | contract | pushed |  |
| 10 | PEA035 | PEA | `_Project 2018-2025\PEA\2022\15. PEA035 RADIO_EXP` — code |  | tor (TOR in archive) | pushed |  |
| 10 | PEA036 | PEA | `_Project 2018-2025\PEA\2022\8. Teleprotection Phuket` — name+year |  | tor | pushed |  |
| 10 | PEA037 | PEA | `_Project 2018-2025\PEA\2022\11. IP Access Y.65 อิสาน` — name+year |  | tor | pushed |  |
| 10 | PEA038 | PEA | `_Project 2018-2025\PEA\2022\16. Tele _Meachan` — name+year |  | tor | pushed |  |
| 10 | PEA039 | PEA |  |  | contract | pushed |  |
| 10 | PEA040 | PEA |  |  | contract | pushed |  |
| 10 | PEA041 | PEA | `_Project 2018-2025\PEA\2023\1. IP Access Y.66 อีสาน` — name+year |  | tor | pushed |  |
| 10 | PEA042 | PEA | `_Project 2018-2025\PEA\2023\2. Spare OFC+Accessories Y.66` — name+year |  | tor (TOR in archive) | pushed |  |
| 10 | PEA043 | PEA | `_Project 2018-2025\PEA\2023\4. Teleprotection บ้านโพธิ์` — name+year |  | tor | pushed |  |
| 10 | PEA044 | PEA |  |  | contract | pushed |  |
| 10 | PEA045 | PEA | `_Project 2018-2025\PEA\2024\1. Spare OFC+Accessories Y67` — name+year |  | tor | pushed |  |
| 10 | PEA046 | PEA | `_Project 2018-2025\PEA\2024\2. Teleprotection ช่วงสถานีเชียงใหม่ Y67` — name+year |  | tor | pushed |  |
| 10 | PEA047 | PEA |  |  | contract | pushed |  |
| 11 | PEA048 | PEA |  |  | contract | pushed |  |
| 11 | PEA049 | PEA | `_Project 2018-2025\PEA\2024\5. IP Access ภาคตะวันออกเฉียงเหนือ Y67` — name+year |  | tor | pushed |  |
| 11 | PEA050 | PEA | `_Project 2018-2025\PEA\2024\7. Teleprotection ช่วงสถานีขอนแก่น 4 Y67 (Re-bidding)` — user's answer |  | tor | pushed | First bid or re-bid — which led to the contract? → **User 2026-10-02: the Re-bidding round is the one that won.** |
| 11 | PEA051 | PEA | `_Project 2018-2025\PEA\2024\9. Dispatch Console` — name+year |  | tor | pushed |  |
| 11 | PEA052 | PEA | `_Project 2018-2025\PEA\2024\11. MA IP Access ภาคตะวันออกเฉียงเหนือ Y67` — name+year |  | tor | pushed |  |
| 11 | PEA053 | PEA | `_Project 2018-2025\PEA\2024\12. MA IP Access ภาคเหนือและภาคใต้ Y67` — name+year |  | tor | pushed |  |
| 11 | PEA054 | PEA | `_Project 2018-2025\PEA\2024\13. Microwave HQ-DR (Re-bidding)` — user's answer |  | tor | pushed | First bid or re-bid — which led to the contract? → **User 2026-10-02: the Re-bidding round is the one that won.** |
| 11 | PEA055 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA056 | PEA |  |  | contract | pushed |  |
| 11 | PEA057 | PEA | `_Project 2018-2025\PEA\2025\PEA057_IP Access ภาคตะวันออกเฉียงเหนือ Y68` — code |  | tor | pushed |  |
| 11 | PEA058 | PEA | `_Project 2018-2025\PEA\2025\PEA058_Digital Radio System` — code |  | tor | pushed |  |
| 11 | PEA059 | PEA | `_Project 2018-2025\PEA\2025\PEA059_Spare OFC+Accessories Y68` — code |  | tor | pushed |  |
| 11 | PEA060 | PEA | `_Project 2018-2025\PEA\2025\PEA060_Teleprotection สถานีไฟฟ้าแปลงยาว` — code |  | tor | pushed |  |
| 11 | PEA061 | PEA |  |  | contract | pushed |  |
| 11 | PEA062 | PEA | `_Project 2018-2025\PEA\2025\PEA062_Microwave HQ-หนองจอก` — code |  | tor | pushed |  |
| 11 | PEA063 | PEA | `_Project 2018-2025\PEA\2025\PEA063_Teleprotection สถานีไฟฟ้าบางสมัคร` — code |  | tor | pushed |  |
| 11 | PEA064 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA066 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA070 | PEA | `_Project 2018-2025\PEA\2025\PEA070_ติดตั้งอุปกรณ์ประชุมออนไลน์` — code |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA072 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA073 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA074 | PEA |  |  | contract | pushed |  |
| 11 | PEA076 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA077 | PEA |  |  | contract | pushed | **Fits no Category (IdeaHub meeting display). User 2026-10-05: add a new Category on production → done 2026-10-05 (Admin Center on prod: "Video Conferencing" / "ระบบประชุมทางไกล", value `video-conferencing`), mirrored into pilot-db; written from `batches/11-pea-b-ideahub.json`.** |
| 11 | PEA078 | PEA | `_Project 2026\PEA\2. PEA078_IP Access ภาคตะวันออกเฉียงเหนือ Y69` — code |  | tor | pushed |  |
| 11 | PEA082 | PEA | `_Project 2026\PEA\3. PEA082_Spare OFC+Accessories Y69` — code |  | tor | pushed |  |
| 11 | PEA083 | PEA | `_Project 2026\PEA\4. PEA083_Teleprotection สถานีไฟฟ้าลำภูรา 2 (ลานไก)` — code |  | tor | pushed |  |
| 11 | PEA084 | PEA | `_Project 2026\PEA\5. PEA084_Microwave 6 Hops` — code |  | tor | pushed |  |
| 11 | PEA085 | PEA | `_Project 2026\PEA\6. PEA085_Teleprotection ในพื้นที่ (กฟก.)` — code |  | tor | pushed |  |
| 11 | PEA086 | PEA | `_Project 2026\PEA\7. PEA086_MA Radio กฟก.2` — code |  | tor | pushed |  |
| 11 | PEA087 | PEA |  |  | contract | pushed |  |
| 11 | PEA089 | PEA | `_Project 2026\PEA\8. PEA089_Radio ภาคกลาง Y69` — code |  | tor | pushed |  |
| 12 | AIT004 | TOT (AIT) |  |  | name (Work Certificate only) | pushed |  |
| 12 | AIT012 | MHESI (AIT) |  |  | contract | pushed |  |
| 12 | ATD001 | ATD |  |  | contract | pushed |  |
| 12 | ATD002 | ATD |  |  | contract | pushed |  |
| 12 | BBT001 | PEA (BBTEC) |  |  | contract | pushed |  |
| 12 | BBT002 | PEA (BBTEC) | `_Project 2018-2025\BBTEC\BBT002 MA OFC Y66 PEA` — code |  | contract | pushed |  |
| 12 | EGAT001 | EGAT | `_Project 2018-2025\EGAT\2023\2.EGAT001_MICROWAVE` — code |  | tor | pushed |  |
| 12 | EGAT003 | EGAT |  |  | contract | pushed |  |
| 12 | EGAT004 | EGAT |  |  | contract | pushed |  |
| 12 | EXIM001 | EXIM | `_Project 2018-2025\EXIM\Core Banking` — name+year |  | tor | pushed |  |
| 12 | FORT001 | MHESI (FORTH) |  |  | contract | pushed |  |
| 12 | FORTH003 | MHESI (FORTH) |  |  | contract | pushed |  |
| 12 | FORTH004 | PEA (FORTH) |  |  | contract | pushed |  |
| 12 | IEAT001 | IEAT | `_Project 2018-2025\IEAT\โครงการเช่าใช้บริการระบบเฝ้าระวัง ควบคุม การจัดการความปลอดภัยอัจฉริยะ` — name+year |  | tor | pushed |  |
| 12 | IRCP001 | NT (IRCP) | `_Project 2018-2025\NT\2024\NTXXX OTA_EXP` — user's answer |  | tor | pushed | Subcontract (IRCP) for NT MDM/OTA migration — one of these NT OTA/MDM folders, or neither? → **User 2026-10-02: accepted Claude's recommendation — folder holds the 2024 MDM_OTA draft TOR.** |
| 12 | IST001 | IST |  |  | contract | pushed |  |
| 12 | MEA002 | MEA |  |  | contract | pushed | Proposal-archive folder DMS7 (no year) — is it this 2018 DMS communications project? → **User 2026-10-02: accepted Claude's recommendation — blank: contract is DMS6, folder is DMS7.** |
| 12 | MEA003 | MEA |  |  | contract | pushed | 2021 MA OFC proposals exist for Zone 2 and Zone 3 (Zone 3 = MEA004). MEA003's districts match MEA006's (Zone 1), so Zone 2 may be wrong — right folder or none? → **User 2026-10-02: accepted Claude's recommendation — blank: contract is MA OFC Zone 1, folder is Zone 2.** |
| 12 | MEA004 | MEA | `_Project 2018-2025\MEA\Proposal\2021\MEA_MA_OFC_Zone 3` (proposal-archive) — name+year |  | tor (TOR in archive) | pushed |  |
| 12 | MEA005 | MEA | `_Project 2018-2025\MEA\Proposal\2023\1_EXMEA LINE_ARRG_66` (proposal-archive) — name+year |  | tor | pushed |  |
| 12 | MEA006 | MEA | `_Project 2018-2025\MEA\Proposal\2023\2_EXMEA_MA_OFC_Z1_67` (proposal-archive) — name+year |  | tor | pushed |  |
| 12 | MEA007 | MEA | `_Project 2018-2025\MEA\Proposal\2025\1. MEA_OFC Underground` (proposal-archive) — user's answer |  | tor | pushed | 2025 OFC Underground proposal or the 2024 Underground Project? → **User 2026-10-02: accepted Claude's recommendation — fiber relocation underground; Underground Project is 115 kV power cable.** |
| 12 | ONDE001 | ONDE | `_Project 2018-2025\ONDE\1. Digital Chumchon` — name+year |  | tor | pushed |  |
| 12 | PIS004 | PIS | `_Project 2018-2025\PIS\PIS004 จ้างผู้ดูแลศูนย์ Y68` — code |  | contract | pushed |  |
| 12 | PIS005 | PEA (PIS) |  |  | contract | pushed |  |
| 12 | RTP001 | RTP | `_Project 2018-2025\RTP\2025\1. Satellite Telephone (Re-bidding)` — user's answer |  | tor | pushed | First bid (2024) or re-bid (2025) — which led to the contract? → **User 2026-10-02: the Re-bidding round is the one that won.** Fits no Category (satellite) → new Category added on prod + pilot-db 2026-10-05; written from batches/12-other-new-categories.json. |
| 12 | SCS002 | CAT (SCS) |  |  | contract | pushed |  |
| 12 | SVOA009 | SVOA |  |  | contract | pushed |  |
| 12 | TKC001 | RTP (TKC) |  |  | contract | pushed |  |
| 12 | TKC002 | NBTC (TKC) |  |  | contract | pushed | Fits no Category (satellite) → new Category added on prod + pilot-db 2026-10-05; written from batches/12-other-new-categories.json. |
| 12 | TKC003 | NBTC (TKC) |  |  | contract | pushed | Fits no Category (satellite) → new Category added on prod + pilot-db 2026-10-05; written from batches/12-other-new-categories.json. |
| 12 | UTEL001 | MEA (UTEL) |  |  | contract | pushed |  |
| 12 | WW003 | TRUE (W&W) |  |  | name (Work Certificate only) | pushed |  |
| 12 | WW005 | W&W |  |  | contract | pushed |  |
| 12 | WW006 | W&W |  |  | contract | pushed |  |
| 12 | WW007 | W&W |  |  | contract | pushed | Fits no Category (base-station MA) → new Category added on prod + pilot-db 2026-10-05; written from batches/12-other-new-categories.json. |
| 12 | WW008 | W&W |  |  | contract | pushed |  |
| 12 | WW009 | W&W |  |  | contract | pushed | Fits no Category (base-station MA) → new Category added on prod + pilot-db 2026-10-05; written from batches/12-other-new-categories.json. |
| 12 | WW010 | W&W |  |  | contract | pushed |  |
| 12 | WW011 | W&W |  |  | contract | pushed | Fits no Category (base-station MA) → new Category added on prod + pilot-db 2026-10-05; written from batches/12-other-new-categories.json. |
| 12 | WW012 | MEA (W&W) | `_Project 2018-2025\W&W\WW012 จัดระเบียบสาย MEA` — code |  | proposal | pushed |  |
| 13 | CAT001 | CAT |  |  | contract | pushed |  |
| 13 | CAT002 | CAT |  |  | contract | pushed |  |
| 13 | CAT003 | CAT |  |  | contract | pushed |  |
| 13 | CAT004 | CAT |  |  | contract | pushed |  |
| 13 | CAT005 | CAT |  |  | contract | pushed |  |
| 13 | CAT006 | CAT |  |  | contract | pushed |  |
| 13 | CAT007 | CAT |  |  | contract | pushed |  |
| 13 | CAT008 | CAT |  |  | contract | pushed |  |
| 13 | CAT009 | CAT |  |  | contract | pushed |  |
| 13 | CAT010 | CAT |  |  | contract | pushed |  |
| 13 | CAT011 | CAT |  |  | contract | pushed |  |
| 13 | CAT012 | CAT |  |  | contract | pushed |  |
| 13 | CAT013 | CAT |  |  | contract | pushed |  |
| 13 | CAT015 | CAT |  |  | contract | pushed |  |
| 13 | CAT016 | CAT |  |  | contract | pushed |  |
| 13 | CAT017 | CAT |  |  | contract | pushed |  |
| 13 | CAT018 | CAT |  |  | contract | pushed |  |
| 13 | CAT019 | CAT |  |  | contract | pushed |  |
| 13 | CAT020 | CAT |  |  | contract | pushed |  |
| 13 | CAT021 | CAT |  |  | contract | pushed |  |
| 13 | CAT022 | CAT |  |  | contract | pushed |  |
| 13 | CAT023 | CAT |  |  | contract | pushed |  |
| 13 | CAT024 | CAT | `_Project 2018-2025\CAT\Proposal\2019\CAT024_อุปกรณ์ DWDM สำหรับลูกค้า ISP และ IPLC` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT025 | CAT | `_Project 2018-2025\CAT\Proposal\2019\CAT025_USO phase 2` (proposal-archive) — user's answer |  | tor | pushed | Card is USO Zone C group 5 (NE 3); the second folder looks like North 2 group 2 — is the first the right one? → **User 2026-10-02: accepted Claude's recommendation — folder holds the group 5 (NE 3) proposal scan.** |
| 13 | CAT026 | CAT | `_Project 2018-2025\CAT\Proposal\2019\CAT026-027_Corrective และ Preventive Maintenance` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT027 | CAT | `_Project 2018-2025\CAT\Proposal\2019\CAT026-027_Corrective และ Preventive Maintenance` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT028 | CAT | `_Project 2018-2025\CAT\Proposal\2019\CAT028_Network Management System (NMS)` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT029 | CAT | `_Project 2018-2025\CAT\Proposal\2019\CAT029_อุปกรณ์ OTN Cross connect VPOP` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT030 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT030-032_CM_PM_N_W63_E63` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT031 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT030-032_CM_PM_N_W63_E63` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT032 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT030-032_CM_PM_N_W63_E63` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT033 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT033_MA_AOTA_DMC` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT034 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT034_VPOP_PH2` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT035 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT035_FILTER` (proposal-archive) — code |  | tor | pushed | Category mobile-base-station (850 MHz filters on mobile sites) — Claude's call, alt. microwave-radio. |
| 13 | CAT036 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT036_NTC_CLS3_SP` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT036-1 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT036_SP_NK_27.5M` (proposal-archive) — user's answer |  | tor | pushed | CAT036's other folder (NTC_CLS3) is Nonthaburi–Chalee 3 = card CAT036; is SP_NK_27.5M this card (Next-Gen DWDM BKK/East/West/South)? → **User 2026-10-02: accepted Claude's recommendation — folder is the Next Generation DWDM (Spare part) proposal.** |
| 13 | CAT037 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT037_UPG_NMS` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT038 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT038-COVID` (proposal-archive) — code |  | tor | pushed | Category medical + tags smart-city-security, software, video-conferencing — Claude's call. |
| 13 | CAT039 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT039_MA_NMS63` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT040 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT040_DWDM_FB_GG` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT041 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT041_MA_EQ_NK` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT042 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT042_DWDM_FB_GG_PH3` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT043 | CAT | `_Project 2018-2025\CAT\Proposal\2020\CAT043_DWDM_FB_GG_PH4` (proposal-archive) — code |  | tor | pushed |  |
| 13 | CAT044 | CAT | `_Project 2018-2025\CAT\Proposal\2021\CAT044_POP_40G` (proposal-archive) — code |  | tor | pushed |  |
| 14 | TOT002 | TOT |  |  | contract | reviewed |  |
| 14 | TOT003 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT004 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT005 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT006 | TOT |  |  | contract | reviewed |  |
| 14 | TOT007 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT008 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT009 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT010 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT012 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT013 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT014 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT016 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT018 | TOT |  |  | contract | reviewed |  |
| 14 | TOT020 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT021 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT022 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT023 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT026 | TOT |  |  | contract | reviewed |  |
| 14 | TOT027 | TOT |  |  | contract | reviewed |  |
| 14 | TOT029 | TOT |  |  | contract | reviewed |  |
| 14 | TOT030 | TOT |  |  | contract | reviewed |  |
| 14 | TOT031 | TOT |  |  | contract | reviewed |  |
| 14 | TOT032 | TOT |  |  | contract | reviewed |  |
| 14 | TOT033 | TOT |  |  | contract | reviewed |  |
| 14 | TOT034 | TOT |  |  | contract | reviewed |  |
| 14 | TOT035 | TOT |  |  | name (Work Certificate only) | reviewed | Question: Category telecom-core + tag software (OM = Order Management, mobile BSS) — OK? |
| 14 | TOT036 | TOT |  |  | name (Work Certificate only) | reviewed | Question: Category telecom-core + tag software (SAAM = Service Activation, mobile BSS) — OK? |
| 14 | TOT037 | TOT | `_Project 2018-2025\TOT\Proposal\2018\TOT_OTA` (proposal-archive) — user's answer |  | tor | reviewed | 2018 proposal folder TOT_OTA — is it this 2018 OTA expansion? → **User 2026-10-02: accepted Claude's recommendation — folder holds the TOT OTA Expansion SOC and implementation plan.** |
| 14 | TOT038 | TOT |  |  | name (Work Certificate only) | reviewed |  |
| 14 | TOT040 | TOT |  |  | contract | reviewed |  |
| 14 | TOT041 | TOT | `_Project 2018-2025\TOT\Proposal\2019\TOT041_งานจัดซื้ออุปกรณ์จัดเก็บข้อมูลจราจรคอมพิวเตอร์` (proposal-archive) — code |  | tor | reviewed |  |
| 14 | TOT042 | TOT |  |  | contract | reviewed |  |
| 14 | TOT043 | TOT |  |  | contract | reviewed |  |
| 14 | TOT044 | TOT | `_Project 2018-2025\TOT\Proposal\2019\TOT044_งานจ้างพัฒนาจัดซื้อ ระบบ Device Management` (proposal-archive) — code |  | tor | reviewed |  |
| 14 | TOT045 | TOT | `_Project 2018-2025\TOT\Proposal\2019\TOT045_งานจ้างติดดั้งอุปกรณ์ DEA (Diameter Edge Agent)` (proposal-archive) — code |  | tor | reviewed |  |
| 14 | TOT046 | TOT | `_Project 2018-2025\TOT\Proposal\2019\TOT046_งานซื้ออุปกรณ์เพื่อรองรับการให้บริการ Contact Center` (proposal-archive) — code |  | tor | reviewed |  |
| 14 | TOT047 | TOT |  |  | contract | reviewed |  |
| 14 | TOT048 | TOT |  |  | contract | reviewed |  |
| 14 | TOT049 | TOT |  |  | contract | reviewed |  |
| 14 | TOT050 | TOT |  |  | contract | reviewed |  |
| 14 | TOT051 | TOT | `_Project 2018-2025\TOT\Proposal\2019\TOT051_งานจ้างติดตั้ง Network Monitoring tools` (proposal-archive) — code |  | tor | reviewed |  |
| 14 | TOT052 | TOT |  |  | contract | reviewed |  |
| 14 | TOT053 | TOT | `_Project 2018-2025\TOT\Proposal\2020\TOT053_SERV_CEN` (proposal-archive) — code |  | tor | reviewed | Question: desktop PCs for Service Centers → data-center-it (no closer Category) — OK? |
| 14 | TOT054 | TOT | `_Project 2018-2025\TOT\Proposal\2020\TOT054_MA_OTA` (proposal-archive) — code |  | tor | reviewed |  |
| 14 | TOT055 | TOT |  |  | contract | reviewed | Question: NTP time servers → transmission + tag ip-network (like TOT027 sync); alternative ip-network — OK? |
| 14 | TOT056 | TOT |  |  | contract | reviewed |  |
