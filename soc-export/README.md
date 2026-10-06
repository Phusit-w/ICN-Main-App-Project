# soc-export

Builds a job's combined `SOC_Check` document (ADR 0008, ticket 10). Called by `lib/soc-combined-check.ts`; needs Python with `python-docx` on the web server (`SOC_PYTHON` names the interpreter).

- `combine_soc_check.py`: runs the skill's `append_results_to_docx.py` on the original SOC, then adds a note listing checked and unchecked major items.
- `skill/append_results_to_docx.py`: an unchanged copy of the script from the `tor-word-compliance-check` skill (`scripts/append_results_to_docx.py`, sha256 `a1e2e86f9e82aac7fe383ac301459663b64e0fdaa02b320dd0d10de1546c9cb8`, copied 2026-10-06). Don't edit it here. Copy the new version from the skill instead. `SOC_SKILL_SCRIPTS_DIR` can point at another skill `scripts/` folder. Once skill hosting (ticket 11) exists, use the current package's script.
