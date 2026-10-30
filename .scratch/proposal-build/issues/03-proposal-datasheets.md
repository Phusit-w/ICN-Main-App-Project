# 03: Datasheet ของ Proposal

**What to build:** A user uploads the Proposal's Datasheets once, folders kept, in browser batches like today's evidence upload; adds more later; removes one. A Datasheet list shows folder path, size and each file's ชื่อที่ใช้อ้างอิง (Citation Name), which can be edited. Spec stories 34–39, 63 (the Citation Name part).

**Blocked by:** 01

**Status:** done

- [ ] Batch upload with folder paths kept; per-Proposal limits 200 PDFs / 1 GB / 120 MB each; per-request batch limits as today.
- [ ] Citation Name defaults to the file name without its leading number and anything after " - " (`08 CASRI Product brochure - surat-1_….pdf` → `CASRI Product brochure`); editable in the list.
- [ ] Remove is a soft removal: off the Proposal's list at once, file kept on disk while any check result cites it (none yet) and purged otherwise; refused while a SOC Runner is running on this Proposal (wired fully in 06).
- [ ] Chip "Datasheet N ไฟล์ · size".
- [ ] Tests at seam A: limits, folder paths, Citation Name default/edit, soft removal. Browser check.
