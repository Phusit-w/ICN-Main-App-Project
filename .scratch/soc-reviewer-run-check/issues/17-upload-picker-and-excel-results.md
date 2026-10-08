# 17: File picker with remove, and results as Excel

**Asked by the user 2026-10-08, after the first real check on prod:**

1. "ไฟล์ที่อัปโหลดอยากให้สามารถกดทีละไฟล์หรือหลายไฟล์ได้และสามารถกดลบได้": pick upload files one at a time or
   several at once, and remove any before sending.
2. "ผลที่ตรวจได้อยากให้เป็นไฟล์ Excel แยกจาก soc เป็นข้อใหญ่ (ในกรณีที่ตรวจทีละข้อใหญ่ไม่ต้องแยกชีต แต่ถ้าจะกดโหลดทีเดียว
   ให้แยกข้อใหญ่ทีละชีใน Excel เดียว)": the results as Excel, separate from the SOC, by major item. One major item gives
   one sheet. One download of everything gives one workbook with one sheet per major item.

**Decisions (user, 2026-10-08):**

- Columns follow the skill's Excel spec (`tor-word-compliance-check` SKILL.md, "ส่งมอบแบบตารางผลแยกจาก SOC"), plus the
  reviewer's Final Decision and note.
- The whole-job file starts with a summary sheet.
- The Word "ดาวน์โหลด SOC_Check" (results appended to the SOC) is **removed**. Excel only.

**Status:** ready-for-human (built and tested by the agent; user checks it in the browser, then deploy)

- [ ] SOC upload (`/soc/new`) and "เพิ่ม PDF หลักฐาน": add files one or many at a time, list with size, ลบ per file
- [ ] Job page "ดาวน์โหลดผลตรวจ (Excel)": summary sheet + one sheet per checked major item
- [ ] Per major item "Excel" link: one sheet, no summary
- [ ] The Word SOC_Check download is gone

## Comments

### 2026-10-08: built

- `components/SocFilePicker.tsx`: chosen files live in state, so each one can be removed. A repeated pick of the same
  file (same name and size) is ignored. Used by `SocUploadForm` (DOCX: one file, "เปลี่ยนไฟล์"; PDFs: many) and the
  job page's "เพิ่ม PDF หลักฐาน". The forms check the server's limits before sending (`evidenceSelectionProblem` in
  `lib/soc-shared.ts`; the limit constants moved there from `lib/soc.ts`). `readUploadResponse` turns a non-JSON
  answer (IIS's HTML page for a too-large upload) into a Thai message instead of "Unexpected token…".
- `lib/soc-results-excel.ts` + `GET /api/soc/jobs/:id/results-excel[?item=<majorItemId>]`, built with `exceljs`
  (4.4.0, MIT; new dependency) from the review page's rows (`socReviewView`, heading rows left out), in SOC order.
  Columns: แถวใน SOC, ข้อ, ข้อกำหนด TOR, หน้าอ้างอิง, ผลอ้างอิง, เลขข้อกำกับ, Highlight, หลักฐานรองรับ,
  ผล TOR (แนะนำ), ความเชื่อมั่น, ประเด็นหลัก, Final Decision, หมายเหตุผู้ตรวจ.
  - ผลอ้างอิง uses the skill's sub-status texts and colours. หน้าอ้างอิง is red for ไม่ตรง/ไม่พบ.
  - Header row and first two columns are frozen; autofilter is on; text wraps.
  - Summary sheet: rows per major item × sub-status, the decided count, a SUM total row, and notes. The notes say what
    is counted, that ผล TOR is only advice, and which major items are not checked yet.
  - Every download is audited as `SOC_RESULTS_DOWNLOADED`.
- Removed: `/api/soc/jobs/:id/soc-check`, `lib/soc-combined-check.ts`, `soc-export/`, its test, and the per-item
  "SOC_Check" (the run's .docx) link. The web server no longer needs Python (`SOC_PYTHON`); docs updated.
- Tests: `test/soc-results-excel.test.ts` (5). `npm test` 158/158, lint + tsc clean.
