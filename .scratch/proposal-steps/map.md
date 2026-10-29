# Map: Proposal แบบเป็น step

Label: wayfinder:map — charted 2026-10-29

## Destination

A spec for the **Proposal** screen (docs/SOC-DOMAIN-GLOSSARY.md § Proposal), ready for `/to-spec` → `/to-tickets`: one Proposal per piece of proposal work, its six Proposal Steps doable in any order, the new กรอกอ้างอิง step, and AI steps runnable on the user's own Claude account or a central one.

## Notes

- Domain: SOC context, vocabulary in `docs/SOC-DOMAIN-GLOSSARY.md` (no CONTEXT.md for SOC); ADRs in `docs/adr/`. Grilling tickets call the Skill tool for "grilling" and "domain-modeling".
- Reply to the user in Thai.
- Plan, don't do: no app code in this map.
- Repo has large unrelated uncommitted WIP: never `git add -A` / `commit -a`, never switch branches for research; research files go to `.scratch/proposal-steps/research/`.
- Decided while charting (2026-10-29):
  - Proposal is a new record tying TOR, โครง Content, SOC, Datasheets; Proposal Steps = TOR, โครง Content, สร้าง SOC, กรอกอ้างอิง, ตรวจ TOR ตรงต้นฉบับ (TOR Match), ตรวจหลักฐาน (SOC check). Skipped step's input = uploaded file.
  - โครง Content = headings the proposal document must have per TOR; this map only reserves its step slot.
  - Every user with SOC app access sees/works on every Proposal (ADR 0007).
  - กรอกอ้างอิง works on generated and uploaded SOCs; suggestions are accepted/edited by a person, written into a new SOC copy, existing references never overwritten.
  - Datasheets uploaded once per Proposal, shared by กรอกอ้างอิง and ตรวจหลักฐาน.
  - Proposal becomes the one way into the SOC app; old SOC jobs stay viewable.
  - AI steps run on the user's own SOC Runner, or go to รอคนรับ for a teammate to take (superseded the charting-time "central account" choice — see ticket 05 / ADR 0013).

## Decisions so far

- [เงื่อนไขการใช้บัญชี Claude ส่วนกลาง](issues/01-central-account-terms.md): Anthropic's terms forbid one Pro/Max/Team seat serving other employees (server or teammate PC); sanctioned shared shapes are pay-per-use or a sales deal — the charting decision on a central account must be re-decided in ticket 05.
- [ของเดิมแต่ละ step รับอะไรและให้อะไร](issues/02-existing-steps-inventory.md): Datasheets and TOR are per job/build today, SOC Build is owner-only with a 30-day hard purge, no job-from-server-file path, nothing searches Datasheets for empty references — seven attach seams listed for ticket 03/04.
- [Proposal ผูกกับ SOC Build และ SOC job อย่างไร](issues/03-proposal-record-shape.md): Proposal owns TOR, numbered SOC Versions and Datasheets (ADR 0012); one SOC job per SOC Version; builds copy their draft in as a version; removed Datasheets kept while cited.
- [กรอกอ้างอิง ทำงานอย่างไร](issues/04-reference-fill.md): code first (item labels, spec values) on the server, AI for the rest per major item on the Runner; per-row รับ/แก้/ไม่รับ then a new SOC Version; PDF page numbers; title-only rows get a page; not-found left empty. Text form split out to [รูปแบบข้อความที่กรอกอ้างอิงเขียนลง SOC](issues/09-reference-text-format.md).
- [บัญชี Claude ส่วนกลาง: ออกแบบ](issues/05-central-account-design.md): no central account or auto-take (terms); users without a Runner send requests to รอคนรับ and a teammate takes them by their own click, result names both (ADR 0013, amends 0008).
- [หน้าจอ Proposal: หน้าตาและการไล่ step](issues/06-proposal-page-prototype.md): variant A — six steps stacked as an open vertical stepper (status, AI/who runs, ใช้/ได้, upload-instead, ↗ to old screens), file chips on top, รอคนรับ on the right; prototype on branch `prototype/proposal-page`.
- [เมนู SOC เข้าผ่าน Proposal และงานเก่า](issues/07-soc-entry-and-old-jobs.md): `/soc` = Proposal list (tabs Proposal | งานตรวจเดิม | สร้าง SOC เดิม), no new job/build outside a Proposal, old jobs not attachable; unique titles, trash → 30-day purge; tile renamed "Proposal & SOC".
- [ตัวอย่าง SOC ที่เขียนอ้างอิงตามรูปแบบของทีม](issues/08-reference-sample.md): two formats — MOF (Thai, "เอกสารส่วนที่ 2 / <sub-folder> / หน้า N") and Apron (English, "CASRI Product Brochure, page N", no Content heading).
- [รูปแบบข้อความที่กรอกอ้างอิงเขียนลง SOC](issues/09-reference-text-format.md): two Reference Styles (Thai multi-line / English one-line), guessed from existing rows or language; heading number from the top Datasheet folder; English uses each Datasheet's editable ชื่อที่ใช้อ้างอิง; every written reference must read back through the check's reader.

**Map complete 2026-10-29** — no open tickets, no fog. Next: `/to-spec`.

## Not yet specified


## Out of scope

- Generating the โครง Content itself — a separate effort after this map.
- Gemini CLI engine for the SOC Runner — already its own side branch (memory soc-builder). A Codex CLI (ChatGPT) engine belongs to the same future effort: one engine seam in the Runner, skill tested per engine for accuracy. Claude Team/Enterprise seats need no change (own login per user); a server-side run under an Enterprise contract (Claude or ChatGPT) would be a new ADR after reading that contract.
- Paid API engine.
- Carrying check results across SOC Versions for rows whose text didn't change — ruled out by the user 2026-10-29; a new version is re-checked in full (ADR 0012).
- Activity log for Proposals — ruled out by the user 2026-10-29 (in-app รอคนรับ notices stay, ADR 0013).
- Central/shared Claude account taking requests automatically, on the server or a teammate's PC — forbidden by Anthropic's terms ([บัญชี Claude ส่วนกลาง: ออกแบบ](issues/05-central-account-design.md)).
