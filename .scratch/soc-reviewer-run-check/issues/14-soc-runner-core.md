# 14: SOC Runner core, happy path (seam 3)

**What to build:** A Python SOC Runner, run from source, reads its config, sends heartbeats, polls for its user's Check Requests, downloads files plus the current skill, runs `claude -p` headless with the skill in full mode on one major item under the user's own Claude login, and submits the results. The server client and the Claude CLI are injected adapters, so `unittest` runs with fakes (following `soc-worker/test_worker.py`). Demo: click ตรวจ on the web, and the runner on the developer's PC produces results that appear on the review page.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] The happy path is tested with a fake server and a fake Claude CLI
- [ ] The skill version used is recorded in the submission
- [ ] A real end-to-end demo on one major item works and is noted in Comments
- [ ] No listening port; it polls only

## Comments
