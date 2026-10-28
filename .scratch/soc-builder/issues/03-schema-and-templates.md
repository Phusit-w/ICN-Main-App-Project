# 03: SocBuild and SocTemplate models, shared template list

**What to build:** Additive migrations for the build record (owner, title, TOR file, template file, page ranges, status, read progress, warnings, output file, created / purge time) and the stored SOC Template (name, file, added by). Template add (validated by ticket 01's contract check, refused with its message), list, delete by its adder or an ADMIN only. Same per-app access check as the SOC app (ADR 0007). Activity log entries for template add / delete. No change to SocJob (ADR 0011).

**Blocked by:** 01

**Status:** done 2026-10-28

- [x] API/DB tests like test/soc-tor-attach.test.ts: add valid / invalid template, list, delete own, delete other's refused, ADMIN deletes any, no SOC access refused
- [x] Migration applies on a fresh DB and does not touch existing tables
- [x] lint, typecheck, tests pass

## Comments

Models SocTemplate + SocBuild (migration 20261028120000_soc_builder, new tables only). Routes: GET/POST /api/soc/templates, DELETE /api/soc/templates/[id]; logic in lib/soc-templates.ts; audit SOC_TEMPLATE_ADDED / SOC_TEMPLATE_DELETED. SocBuild keeps its own copy of template + TOR + output files under builds/<id>/ (ticket 04 writes it). Tests: test/soc-templates.test.ts (5); full suite 458 pass on test-db32 (port 51821, next test DB = test-db33).
