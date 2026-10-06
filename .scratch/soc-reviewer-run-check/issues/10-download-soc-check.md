# 10: Download the combined SOC_Check document

**What to build:** A team member downloads one `SOC_Check` Word document for the whole job. It is built on the server from the latest results of every checked major item, appended to the original SOC by the skill's deterministic `append_results_to_docx.py` (not AI). Superseded runs never appear in it. Major items not yet checked are listed as not checked.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The download contains every checked major item's latest rows and none of the replaced ones
- [ ] Unchecked major items are clearly marked
- [ ] The original SOC table is unchanged in the output
- [ ] The download is access-checked and audited; lint, typecheck and build pass

## Comments
