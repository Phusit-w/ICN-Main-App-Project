# ของเดิมแต่ละ step รับอะไรและให้อะไร

Type: research
Status: resolved
Blocked by: —

## Question

From the code in this repo (primary source), for each existing piece a Proposal Step will wrap — SOC Build (`/soc/builds`, `lib/soc-builder.ts`), SOC job upload/import (Word/Excel/PDF/scanned SOC), TOR Match (TOR ต้นฉบับ attach + match), Check Request / SOC Runner check — what are its input files, where and how are they stored (models, storage paths, Datasheet/evidence PDFs per job, size limits), what does it output, what retention/purge applies, and what owner/access checks it has? Also: can a SOC job today be created from a file the server already holds (e.g. a Generated SOC Draft), and what does the `soc-no-page` skill and the Evidence Packet builder already do toward finding a row's Datasheet file and page? End with a short list of the seams where a Proposal record would attach.

## Comments

Research: research/02-existing-steps-inventory.md

## Answer

All SOC files live under SOC_STORAGE_ROOT per job (`<jobId>/`) or per build (`builds/<id>/`); limits SOC ≤25 MB, PDF ≤120 MB, ≤200 PDFs / 1 GB per job. SOC Build: owner/ADMIN only, own list, hard purge at 30 days. SOC job: Datasheets are per-job EVIDENCE docs, any SOC user can open/add, trash → purge 30 days. TOR Match: one TOR_ORIGINAL per job (separate from the build's TOR). Check Request: only the requester's runner can claim (lib/soc-check-requests.ts:410-416). No way today to make a job from a server-held file (createImportedSocJob takes bytes, upload route only). soc-no-page is a cowork-only prompt skill, unused by app/runner; Evidence Packet builder only follows existing references — nothing searches all Datasheets for empty-reference rows. Attach seams: SocBuild access/purge clash, draft→job server call, Proposal-owned Datasheet store, two TOR objects, SocJob.proposalId + lifecycle, second claim rule, new runner request kind for กรอกอ้างอิง. Detail: research/02-existing-steps-inventory.md.
