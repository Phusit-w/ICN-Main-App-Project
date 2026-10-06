# ADR: SOC Human Review and On-Prem OCR

- **Status:** Accepted
- **Date:** 2026-09-02

## Decision

ทุกผลตรวจอัตโนมัติเป็นคำแนะนำและผู้ใช้ต้องยืนยันทีละแถวก่อน export ระบบไม่ใช้
confidence เป็น pass signal และไม่เปิด auto-pass จนกว่าจะผ่าน acceptance gates ครบถ้วน

หน้า PDF ที่ไม่มี text layer สามารถใช้ OCR ภายในเซิร์ฟเวอร์ผ่าน provider boundary ได้
ค่าเริ่มต้นเป็น `disabled`; implementation แรกคือ Tesseract `tha+eng` และผลต้องระบุ
`fidelity=ocr` เพื่อให้ semantic policy ลดระดับผลที่คลุมเครือเป็น `needs_review`

AI provider แยกจาก OCR และยังปิดแบบ fail-closed เอกสารจะไม่ออกนอกองค์กรหากไม่มี
provider ที่ได้รับอนุมัติอย่างชัดเจน

## Consequences

- Reviewer workload ยังไม่ลดด้วย auto-pass แต่ทุกผลมีเหตุผลและหลักฐานตรวจย้อนกลับได้
- Server ที่เปิด OCR ต้องติดตั้ง Tesseract, Thai/English language data และ Python packages
- การเปลี่ยน OCR/semantic engine ต้องรัน benchmark และบันทึกเวอร์ชันผลลัพธ์
