# Proposal ผูกกับ SOC Build และ SOC job อย่างไร

Type: grilling
Status: resolved
Blocked by: 02

## Question

What does a Proposal hold and how does it relate to SOC Build and SOC job: one or many of each per Proposal, which SOC file is "the Proposal's SOC" as it moves through steps (Generated SOC Draft → uploaded SOC → copy with references filled → checked), what happens to later steps when an earlier file is replaced, and does this need an ADR superseding part of ADR 0011 (SOC Build separate from SOC job)?

## Answer

Recorded as ADR 0012 (`docs/adr/0012-proposal-owns-its-files.md`) and glossary § Proposal (ฉบับ SOC). Decided 2026-10-29:

1. The Proposal owns its files: one TOR, its SOC Versions, its Datasheets. SOC Build and SOC job run on them.
2. SOC = numbered SOC Versions (draft, upload, กรอกอ้างอิง copy, bidder's fix); latest is current; older stay viewable.
3. One SOC job per SOC Version, created when ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน first starts on it.
4. New version → both checks start over as ยังไม่ทำ; results stay with the old version, no carry-over (fog).
5. SOC jobs read the Proposal's Datasheets, no copy. Datasheets can be added/removed any time except while a Runner checks.
6. One TOR feeds สร้าง SOC and TOR Match; replacing it marks the TOR Match as from the old TOR; drafts untouched.
7. A finished SOC Build's draft is copied in as a SOC Version; the build keeps ADR 0011's rules (30-day purge), but anyone who can open the Proposal sees its builds.
8. ADR 0012 builds on 0011 (0011's "use this draft" now points to it).
9. Removing a Datasheet takes it off the Proposal; the file is kept while any check result cites it, deleted when none does or with the Proposal.
10. Limits = SOC job limits (200 PDFs, 1 GB, 120 MB each) counted per Proposal.
