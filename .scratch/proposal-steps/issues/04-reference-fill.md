# กรอกอ้างอิง ทำงานอย่างไร

Type: grilling
Status: resolved
Blocked by: 02, 03

## Question

How does กรอกอ้างอิง find each row's Datasheet title and page — code only, AI on a SOC Runner, or code first then AI for the rest (reusing `soc-no-page` / Evidence Packet builder)? How is a suggestion shown for accept/edit, what is written for Word vs Excel SOC (a PDF SOC is already an Excel SOC), what text form the reference takes (folder or file title + page, matching the format the check's reference reader understands), and what happens to a row where nothing is found?

## Answer

Decided 2026-10-29:

1. Find by code first, then AI only for rows left: code looks for pages carrying the row's item label (the packet builder's `label_index` / label extraction) and pages whose spec values match the TOR; AI on a SOC Runner takes the rest.
2. Code step runs on the server for the whole SOC at once; the AI step runs one major item at a time as a new Check Request kind on the same Runner queue (confirm popup, cancel), like ตรวจหลักฐาน.
3. A suggestion shows document title + page + a short snippet from that page matching the TOR + its source (item label / spec value / AI), up to 2 alternatives, and opens the page (review-page viewer).
4. Per row รับ / แก้ / ไม่รับ, plus "รับทั้งหมดที่พบจากเลขข้อกำกับ"; "สร้างฉบับ SOC ใหม่" writes accepted rows only, others stay empty; not every row has to be looked at first.
5. Text form: team format (Content-outline heading + sub-folder + page) — split out to [รูปแบบข้อความที่กรอกอ้างอิงเขียนลง SOC](09-reference-text-format.md), waiting on [ตัวอย่าง SOC ที่เขียนอ้างอิงตามรูปแบบของทีม](08-reference-sample.md).
6. Page = PDF page number of the file (page 1 = first page of the file), as the check already assumes.
7. A row with a document title but no page: search only inside the named document and append the page to the existing text. Rows with full references are never overwritten.
8. Not found: reference left empty, table shows "ไม่พบ", count summary on top (พบ N / ไม่พบ M); nothing is written into the SOC for it. Heading rows and skipped (ไม่ต้องตรวจ) major items aren't searched.
