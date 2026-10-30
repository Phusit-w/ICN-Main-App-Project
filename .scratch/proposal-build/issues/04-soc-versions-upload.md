# 04: ฉบับ SOC จากการ upload

**What to build:** A user uploads a SOC (Word, Excel, text PDF or scanned PDF, accepted exactly as the SOC check accepts it today) and it becomes the Proposal's next numbered SOC Version, the current one. Older versions stay listed, viewable and downloadable, each showing its source and time. Spec stories 29–33.

**Blocked by:** 01

**Status:** done

- [ ] SOC Version model (number, source upload/build/reference_fill, created at, SOC file; PDF SOC keeps its source PDF and row pages; scanned PDF SOC reads through the existing OCR queue before it counts as current).
- [ ] A SOC whose table can't be read is refused as today.
- [ ] Latest readable version is current; chip "SOC ปัจจุบัน: ฉบับ N"; list column in `/soc` filled.
- [ ] Version history on the Proposal page with download.
- [ ] Tests at seam A: numbering, current version, Word/Excel/PDF accepted, unreadable refused. Browser check.
