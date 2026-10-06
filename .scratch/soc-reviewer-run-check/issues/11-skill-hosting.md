# 11: Host versioned SOC skill packages on the server

**What to build:** An admin uploads a SOC skill package (`.skill`/zip) to the server, sees the list of versions, and marks one as current. The served package carries a headless instruction: when cited documents are missing (skill step 0), write a structured missing-documents result and stop, instead of asking a question. The job page shows which skill version each major item was checked with, and flags items checked with an older version than the current one.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Upload, list and set-current work, for ADMIN only
- [ ] Exactly one version is current at a time
- [ ] The headless step-0 instruction is part of the served package and is documented
- [ ] Major items show their skill version and an "older than current" flag
- [ ] Audited; tests cover set-current and access; lint, typecheck and build pass

## Comments
