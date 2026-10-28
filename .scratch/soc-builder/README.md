# สร้าง SOC (SOC Builder): progress board

> **เริ่ม session ใหม่ทุกครั้ง อ่านไฟล์นี้ก่อน**

Spec: `spec.md`. Decisions: `DECISIONS.md` (28). ADR: `docs/adr/0011-soc-build-separate-from-soc-job.md`. Glossary: "สร้าง SOC (SOC Builder)" in `docs/SOC-DOMAIN-GLOSSARY.md`.

## How to continue

1. Say **`/implement .scratch/soc-builder/issues/<NN>-....md`**. Pick the first `ready-for-agent` ticket whose blockers are all `done`. 02, 03 and 07 can go in any order once their blockers are done.
2. At the end of every session, update the ticket's `Status:` and checkboxes, add a dated note under `## Comments`, and update this board.
3. User will send 2-3 sample SOC Templates for ticket 02. Samples: `Example SOC+TOR+Datasheet` (outside git, copy to a short folder for MAX_PATH).
4. Next test DB: test-db33 or later (test-db32 port 51811 in use 2026-10-28).

## Board

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | SOC builder module (item splitter + template filling) | - | ready-for-agent |
| 02 | Measure split accuracy on MEA, MOF, Apron | 01 | ready-for-agent |
| 03 | SocBuild and SocTemplate models, shared template list | 01 | ready-for-agent |
| 04 | Create a build from a text TOR and download the draft | 01, 03 | ready-for-agent |
| 05 | สร้าง SOC sub-menu and pages | 04 | ready-for-agent |
| 06 | Scanned TOR build through the shared OCR queue | 04, 05 | code done (live check left) |
| 07 | Delete builds 30 days after creation | 04 | done |
| 08 | ให้ AI ทวนข้อความ OCR (optional, last) | 06 | ready-for-agent |
| 09 | Measure the AI proofread on MOF and Apron | 08 | ready-for-human |
