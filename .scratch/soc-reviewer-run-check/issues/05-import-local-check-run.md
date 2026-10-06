# 05: Import one Local Check Run (seam 1)

**What to build:** On a major item, a user uploads the `results.json` and `SOC_Check` document from a Claude Code run. One import operation validates the file against the skill's `word-output.md` rules: full_audit mode, both evidence_support and tor_decision options, the required fields per row, and every row belonging to that major item. If anything is wrong, the whole file is rejected with Thai reasons and nothing is written. If the file is valid, every axis the skill produces is stored per row, together with the major item, skill version, model and source (manual), and the major item becomes `checked`. Progress updates. This is the only code path that writes check results; ticket 13 reuses it. Rows can be shown in a plain list for now (the real review page is ticket 08).

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A valid real fixture (from ticket 02, or `soc-compliance-check/out_sonnet`) imports, and all axes are stored
- [ ] Each validation rule has a test proving rejection with nothing written
- [ ] Rows from another major item are rejected
- [ ] Skill version, model and source are stored and shown
- [ ] Progress moves to 1/N
- [ ] An audit event is written; lint, typecheck and build pass

## Comments
