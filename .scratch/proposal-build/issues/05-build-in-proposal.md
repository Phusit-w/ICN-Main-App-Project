# 05: สร้าง SOC ใน Proposal

**What to build:** From the สร้าง SOC step a user builds a SOC from the Proposal's TOR (page ranges + SOC Template, as today's build form) without uploading the TOR again; when the build is READY its Generated SOC Draft becomes a new SOC Version automatically. Every user who can open the Proposal sees its builds; the step links ↗ to the build page. Spec stories 40–43.

**Blocked by:** 02, 04

**Status:** done

- [ ] Build started from a Proposal uses the Proposal's TOR (text and scanned paths, OCR confirm as today); `SocBuild` linked to the Proposal.
- [ ] On READY the draft is copied in as a SOC Version (source build); a failed or cancelled build adds nothing.
- [ ] Build access widens to Proposal access when linked; standalone builds keep owner/ADMIN access.
- [ ] Build still purged after 30 days; the SOC Version made from it remains.
- [ ] Step status: กำลังทำ while building, เสร็จ once a build-sourced version exists.
- [ ] Tests at seam A (prior art `test/soc-builds.test.ts`). Browser check.
