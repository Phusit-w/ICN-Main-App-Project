# 05: Live acceptance on Surat CASRI

**What to build:** The user confirms on a real job that a text PDF SOC works end to end before deploy. See `.scratch/soc-pdf-soc/spec.md` (Testing Decisions, Further Notes for the sample path; copy it to a short path first).

**Blocked by:** 01, 02, 04

**Status:** ready-for-human

- [ ] Upload the Surat CASRI PDF. Every SOC row of the PDF appears exactly once, and the major items make sense (and match the Excel or Word version of the same SOC if one exists).
- [ ] On 20 sampled rows, the Thai TOR, proposal and reference text matches the PDF exactly (marks included), and the ✓ columns match.
- [ ] "ดูหน้า PDF SOC" opens the right page for the sampled rows.
- [ ] One major item checked by a real SOC Runner imports without error, and its review page and results Excel look like an Excel SOC's.
- [ ] Upload the USO 4 School PDF: it is refused with the scanned message.
- [ ] Then push and deploy (one migration from 04). No Runner reinstall and no Skill Package upload are needed.

## Comments
