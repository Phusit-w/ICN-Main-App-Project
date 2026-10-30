# 02: TOR ของ Proposal

**What to build:** On the TOR step a user uploads the Proposal's one TOR PDF (a scanned one asks for OCR confirmation first, as today) and can replace it. The step turns เสร็จ and the TOR chip shows name and page count. Spec stories 25–28 (the "replace marks TOR Match ต้องทำใหม่" part becomes testable in 06).

**Blocked by:** 01

**Status:** done

- [ ] Upload stores the TOR in the Proposal's folder with the existing write-once storage helper and EVIDENCE PDF limits (≤120 MB, real PDF).
- [ ] Scanned TOR requires the OCR confirm; without OCR set up it is refused as today.
- [ ] Replace keeps only one current TOR; the old file is kept while anything cites it (nothing yet) and otherwise deleted.
- [ ] TOR step status เสร็จ, current-state line "ชื่อไฟล์ · N หน้า", chip on top.
- [ ] Tests at seam A: upload, replace, scanned without confirm refused, step status. Browser check.
