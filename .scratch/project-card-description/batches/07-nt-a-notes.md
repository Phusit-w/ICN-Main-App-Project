# Batch 07 (NT A) — reading notes for the cards not yet written

Paused 2026-10-02 by the user after NT001–NT005 were written (style approved: "ตามนี้" — 3–4 sentences,
system/model names, a closing bracket of search keywords; secondary work like program improvements still
counted as System Development; PABX/charging/SIM/switching all under Telecom Core & OSS/BSS).
Each line: source file read (relative to the card's Project Folder in the worklist) → facts found → planned
classification. "SOC" = ICN's compliance table that reproduces the TOR text verbatim (content is the TOR,
so source `tor` when an official TOR is also in the folder; `proposal` when there is none).

| Card | Source read | Facts | Planned Category / Tags / Work Types / Source |
|---|---|---|---|
| NT006 | (no TOR in folder) `NT_BB_BBK to S_20211220_Scan\บทที่ 2 ตารางการยอมรับขอบเขตของงาน (156หน้า).pdf` — scanned, **not yet read**; also `บทที่ 1 บทนำ (72หน้า).pdf`, `optix_osn_9800 addition 6.2.pdf` | Backbone transmission expansion Bangkok–South (name); Huawei OptiX OSN 9800 likely | transmission / – / supply, installation / **proposal** |
| NT007 | `Official_TOR\Official TOR MA Backhaul.pdf` (scan; TOR starts p30, general p33) | MA of the DWDM backhaul between central office and submarine cable station: Nokia 1830 PSS-32/64 + ASN 1620LM/PFE ("ระบบเชื่อมโยง DWDM"), spare parts | transmission / – / ma / tor |
| NT008 | `Official_TOR\Official TOR MA NMS project.pdf` (scan; general p32) | MA of NMS: Nokia (Alcatel-Lucent) 1350 OMS R14.2 and R12.3 | transmission / telecom-core / ma / tor |
| NT009 | `Official_TOR\ข้อกำหนดทางด้านเทคนิค อุปกรณ์ระบบ Policy Control Functi.pdf` (text) | Purchase of PCF/PCRF policy & charging rules system (1 system) for the mobile network: supply, installation, acceptance test, training | telecom-core / – / supply, installation / tor |
| NT010 | `Official_TOR\8_12_64 ขอบเขตงาน DEAv2_จัดหา.docx` | Expand DEA (Diameter Edge Agent) capacity + add DRA (Diameter Routing Agent) function replacing full-mesh links, for NT1 Roaming customers (OPT-40/2021) | telecom-core / – / supply, installation / tor |
| NT011 | `Official_TOR\9_12_64 ขอบเขตงาน Expand_monitoring_พัสดุ.docx` | Expand Network Monitoring Tool: more capacity licences + VoLTE/VoWiFi support, analyse mobile subscriber problems, NT1 Roaming (OPT-39/2021) | telecom-core / software / supply, installation / tor |
| NT013 | `Official_TOR\ข้อกำหนดด้านเทคนิค-จ้างบำรุงรักษา OFC(1).docx` | MA (corrective, 24x7) of fiber optic network for USO broadband in border villages, Zone C+ group 2 (North 2) and group 3 (Northeast), for NBTC (กสทช.); cable, enclosure, patch cord, splitter | fiber-optic / – / ma / tor |
| NT014 | (no official TOR) `_src\4. SOC - Part III Technical Requirement_3G MA Transport_new.doc` | MA of Core Switch + spare-part management of Transport Network (3G/4G), incl. NMS; critical spares Aggregate Switch 10G/1G | transmission / ip-network / ma / **proposal** |
| NT017 | `Official_TOR MA DMS Y.2022\TOR MA DMS Y.22.pdf` (scan p4) | MA of Device Management System (manages smartphones, tablets, IoT etc. on NTmobile 2100/2300 MHz 3G/4G) + program improvements (OPT-34/2021) | telecom-core / software / ma, system-development / tor |
| NT018/019/020 | Region TORs `Official_TOR_Corrective และ Preventive Maintenance\TOR_…(นภ / วภ / อภ)_Final.pdf` (scans); SOC `S4_ข้อกำหนดทางเทคนิค(CM)_…(วภ/อภ).doc` read (NT018's นภ S4 file not yet converted) | CM/PM of Core & Distribution fiber optic network (fiber cable, drop wire, enclosure), 24x7, per region: North (นภ.), West (วภ.), East (อภ.) | fiber-optic / – / ma / tor |
| NT021 | `Proposal A\Section 2 Statement of Compliance\03_SOC_MS_RTC_Technical Requirement (Update 20220204).doc`; official `Official_TOR\หนังสือเชิญ+TOR_MS-RTC Y.65.pdf` | Same RTC managed service as NT001, 12 months (OCS, SCG, WOM, Provisioning, Data & Report, API Converter, OCS Support) incl. daily CM | telecom-core / software / managed-services, system-development / tor |
| NT022 | `…Proposal A\Huawei Update\03_SOC_Smart Pole EEC_Technical Requirement (Update20220613)…doc`; official `Official TOR\TOR_SmartPoleEEC_รอบ2_(final).pdf` (re-bid round) | 5G Smart City for EEC: smart poles with PTZ/fixed CCTV, LPR cameras, 5G CPE, 5G SIM + airtime, 5G MEC (multi-access edge computing) | smart-city-security / telecom-core / supply, installation / tor |
| NT023 | `Official_TOR\TOR ความต้องการทางเทคนิค MA Network Montioring Tools_R1.doc` | 12-month warranty & maintenance of Network Monitoring Tools that monitor mobile signaling (voice + data) to analyse subscriber problems | telecom-core / – / ma / tor |
| NT024 | (no TOR) `NEC\_src\2-1 NT_T003_2022__technical_requirement-complied…doc` | Backbone expansion for ISP-POP: Huawei OSN 8800 DWDM, new 100GE circuits (T003/2022) | transmission / – / supply, installation / **proposal** |
| NT025 | `Official_TOR\TOR_Nokia155M_18Jan2022_FinalEdit.pdf` (text) | Nokia 1830 PSS-32 DWDM for backhaul between central and submarine cable stations (NTC–CLS2/Chalee 3), managed by existing NMS; install, test, training at Chalee 2/3 | transmission / – / supply, installation / tor |
| NT026 | `Official_TOR\TOR_MA_BKK6_บริษัท.pdf` (text) | 2022 renewal of NT004: MA of BKK6 international exchange, Huawei | telecom-core / – / ma / tor |
| NT027 | `Official_TOR\OCSCHF_final.pdf` (text) | Purchase: upgrade & expand Online Charging System (OCS) / Charging Function (CHF), 1 system, install + test + training | telecom-core / software / supply, installation / tor |
| NT028 | `Official_TOR\MA 66 Nokia_Final.docx` | 2023 MA of DWDM backhaul (Nokia 1830 PSS-32/64, ASN 1620LM/PFE) and NMS — renewal of NT007 + NT008 | transmission / – / ma / tor |
| NT029 | `Proposal A\Chapter 2 Statement of Compliance\02_SOC_MA_Transport_Part I_ขอบเขตของงาน.doc`; official `Official TOR\TOR Core Switch.pdf` | MA of Core Switch + spare management of Transport Network for 3G and 4G LTE, 12 months (OPT-27/2022) — renewal of NT014 | transmission / ip-network / ma / tor |
| NT030 | `…\02_SOC_MA_DEA_Part I_ขอบเขตของงาน.doc`; official `Official_TOR\TORทั้งเล่ม.pdf` | Warranty & MA of DEA (Diameter signaling firewall to partner networks for LTE roaming), 3G/4G | telecom-core / – / ma / tor |
| NT031 | `_Official_TOR\TOR เทคนิค_N2-BB2_ร่าง ส่วนที่ 2 (กลุ่ม 2) ณ 06-02-66.docx` (draft) | MA of fiber optic network and equipment for USO Zone C+ group 2 (North 2) part 1 broadband, for NBTC | fiber-optic / – / ma / tor |
| NT032 | `…\02_SOC_MA_OTA_ขอบเขตของงาน_Part I.doc`; official `Official_TOR\TOR MA OTA (Official).pdf` | 2023 renewal of NT003: OTA SIM management MA + program improvements, NTmobile | telecom-core / software / ma, system-development / tor |
| NT033 | `…\02_SOC_MA_DMS_ขอบเขตของงาน_PART I.doc`; official `Official_TOR\device.pdf` | 2023 renewal of NT017: Device Management System MA + program improvements | telecom-core / software / ma, system-development / tor |
| NT034 | `TOR\ข้อกำหนดทางด้านเทคนิค อุปกรณ์โครงข่าย (Network .pdf` (text) | Purchase of network equipment for 4G/5G mobile on 700 MHz, 1 system: supply, install, test, training | telecom-core / – / supply, installation / tor |
| NT036 | `…\02_SOC_MA_MON_ขอบเขตของงาน.doc` | 2023 renewal of NT023: MA of Network Monitoring Tools (OPT-010/2022) | telecom-core / – / ma / tor |

Still to do before writing: confirm NT006 (read a few pages of its compliance table or บทที่ 1), and optionally
NT034's equipment list (vendor) and NT009/NT027 vendor names. Then write the 27 entries into
`07-nt-a.json` (append) and run `write-local.mjs 07-nt-a.json` (it re-sends NT001–005 unchanged, harmless).

Local tooling used (scratchpad, not in repo): PyMuPDF text extraction and page rendering for scans; Word COM
(Office 16 installed) to read `.doc` — always on a local copy opened read-only, never on the share.
