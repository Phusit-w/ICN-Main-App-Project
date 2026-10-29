# รูปแบบข้อความที่กรอกอ้างอิงเขียนลง SOC

Type: grilling
Status: resolved
Blocked by: 08

## Question

From the team's samples (ticket 08): what exact text does กรอกอ้างอิง write — the Content-outline heading + sub-folder name + `หน้า N` — and where does the heading come from when the โครง Content step hasn't been built yet (is it the Datasheet tree's top folder name, typed by the user, or must โครง Content exist first)? Does the check's reference reader (`build_evidence_packet.py` `cited_folders`/`cited_files`/`cited_pages`) read that form unchanged, and how are several pages or several documents for one row written?

## Answer

Decided 2026-10-29. The check's reader (build_evidence_packet.py: CHAPTER treats ส่วนที่/บทที่ alike, PAGE_PART reads หน้า/หน้าที่/page/pages/p., cited_folders by dotted number, cited_files by ≥60% name words) reads both sample forms unchanged.

1. Two Reference Styles: Thai multi-line (MOF) and English one-line (Apron). Guessed from rows that already have a reference in the SOC, else from the SOC/TOR language; switchable on the กรอกอ้างอิง page before writing; one per Proposal.
2. Thai heading line 'เอกสารส่วนที่ N': N from the Datasheet top folder ('บทที่ 2 …' or '2. …'); wording 'เอกสารส่วนที่' unless existing rows use another; line left out when there is no numbered top folder. Using โครง Content headings later is out of this map.
3. Document name: Thai = full sub-folder name, plus a file-name line when that folder holds more than one PDF. English = each Datasheet's ชื่อที่ใช้อ้างอิง, defaulting to the file name without its leading number and anything after ' - ' (editable once per file in the Datasheet list).
4. Guard: before writing a SOC Version, every new reference is read back with the check's reader; one that doesn't resolve to the intended file and page blocks the write with a warning until fixed.
5. Several pages: 'หน้า 3, 6' / 'page 3, 6', consecutive as 'หน้า 12-13'. Several documents: Thai = one block per document on new lines; English = joined with '; '.
6. Title-only rows: append 'หน้า N' on a new line (Thai) or ', page N' (English); existing text untouched.
