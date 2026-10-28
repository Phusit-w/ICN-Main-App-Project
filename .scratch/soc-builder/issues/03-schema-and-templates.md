# 03: SocBuild and SocTemplate models, shared template list

**What to build:** Additive migrations for the build record (owner, title, TOR file, template file, page ranges, status, read progress, warnings, output file, created / purge time) and the stored SOC Template (name, file, added by). Template add (validated by ticket 01's contract check, refused with its message), list, delete by its adder or an ADMIN only. Same per-app access check as the SOC app (ADR 0007). Activity log entries for template add / delete. No change to SocJob (ADR 0011).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] API/DB tests like test/soc-tor-attach.test.ts: add valid / invalid template, list, delete own, delete other's refused, ADMIN deletes any, no SOC access refused
- [ ] Migration applies on a fresh DB and does not touch existing tables
- [ ] lint, typecheck, tests pass

## Comments
