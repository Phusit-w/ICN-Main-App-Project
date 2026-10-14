# 05: Live acceptance on Surat CASRI

**What to build:** The user confirms on a real job that a text PDF SOC works end to end before deploy. See `.scratch/soc-pdf-soc/spec.md` (Testing Decisions, Further Notes for the sample path; copy it to a short path first).

**Blocked by:** 01, 02, 04

**Status:** done

- [x] Upload the Surat CASRI PDF. Every SOC row of the PDF appears exactly once, and the major items make sense (and match the Excel or Word version of the same SOC if one exists).
- [x] On 20 sampled rows, the Thai TOR, proposal and reference text matches the PDF exactly (marks included), and the ✓ columns match.
- [x] "ดูหน้า PDF SOC" opens the right page for the sampled rows.
- [x] One major item checked by a real SOC Runner imports without error, and its review page and results Excel look like an Excel SOC's.
- [x] Upload the USO 4 School PDF: it is refused with the scanned message.
- [x] Then push and deploy (one migration from 04). No Runner reinstall and no Skill Package upload are needed.

## Comments

2026-10-14 (agent pre-check, before the human steps): 01–04 pushed to origin/main (f6dbf07), not deployed.
- `convertPdfSoc` on `C:\Phusit\socpdf\surat.pdf`: 332 rows, 332 row pages, no warnings. 16 major items, same labels and row counts as `surat.docx`.
- All 310 numbered rows: TOR and proposal text equal the Word version's after whitespace normalisation. The one difference (๓.๓.๔.๒) is a zero-width space at the end of the Word proposal, not in the PDF.
- Generated sheet: comply ✓ 204, better ✓ 77, reference filled 317.
- `uso.pdf` is refused with the scanned message.
- 20 evenly spread rows (row, PDF page, all columns) for the human check: `C:\Phusit\socpdf\sample20-check.txt`.
- The SOC Runner talks to the prod server, so the live Runner step comes after the deploy.

2026-10-14 (human, local dev 3100, job "test surat"): the user checked rows, sample and "ดูหน้า PDF SOC"; all looked complete. The upload showed "Jest worker encountered 2 child process exceptions" on the old dev server. Every /soc/[id] page on that server failed, Word jobs included. A fresh dev server showed the same job fine, so the dev server was at fault, not this feature. Next: deploy, then the live Runner step on prod.

2026-10-14 (human, prod): deployed. A PDF SOC uploaded on prod gave the same results as the Excel version of the SOC. The user found it OK. The USO refusal was confirmed by the agent pre-check (converter), not on prod. Images in TOR cells of a PDF SOC (MEA-style) are still counted, not read; the user was told to use the Word/Excel file. Reading them belongs with the scanned PDF SOC feature.
