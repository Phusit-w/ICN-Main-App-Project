# 04: Create an Imported SOC Check with its major items

**What to build:** A user with `soc` access uploads one Word SOC plus evidence PDFs and gets an Imported SOC Check: a `SocJob` of the new "imported" kind (ADR 0002 pattern) that the server-side worker never picks up. The job page lists the SOC's major items (ข้อใหญ่), read from the SOC table structure, each in state `not_checked`, with progress "ตรวจแล้ว 0/N ข้อใหญ่" on the job page and on the `/soc` list. Any user with `soc` access may open the job and add evidence PDFs (Q17 = b); ADMIN keeps everything. Existing 90-day expiry and private storage apply. See the spec's "Job model".

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] Creating an imported job stores the files and creates one major-item record per ข้อใหญ่, in order
- [ ] The worker ignores imported jobs (verified)
- [ ] Progress 0/N is shown on the list and the job page
- [ ] Another `soc` user can open the job and add an evidence PDF, and a user without `soc` access cannot (server-side check)
- [ ] The creation and the evidence addition are written to the audit trail
- [ ] Tests cover major-item creation and access; lint, typecheck and build pass

## Comments
