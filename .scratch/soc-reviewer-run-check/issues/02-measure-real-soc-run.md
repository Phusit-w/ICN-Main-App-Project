# 02: Measure accuracy and quota on one real SOC major item

**What to build:** The user runs the current `tor-word-compliance-check` skill (from `SOC model compliance/Skill`) in Claude Code on one major item of a real Word SOC, in full mode (full_audit + evidence_support + tor_decision), with Sonnet. They record how long it took, how much of the Pro usage window it used, and whether the findings look right. The resulting `results.json` and `SOC_Check` document are kept as real fixtures for ticket 05. This blocks no code, but it confirms the approach is worth building and sizes major items against the quota.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] One major item is checked end to end; the row count, duration and approximate quota used are written in Comments
- [ ] The user's judgement of accuracy (rows right / wrong / unsure) is written in Comments
- [ ] The `results.json` and `SOC_Check` document are saved somewhere the agent can read, and the path is written in Comments
- [ ] Anything the skill did badly (e.g. step 0 behaviour) is noted

## Comments
