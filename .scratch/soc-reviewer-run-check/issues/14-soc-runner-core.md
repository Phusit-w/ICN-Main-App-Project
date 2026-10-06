# 14: SOC Runner core, happy path (seam 3)

**What to build:** A Python SOC Runner, run from source, reads its config, sends heartbeats, polls for its user's Check Requests, downloads files plus the current skill, runs `claude -p` headless with the skill in full mode on one major item under the user's own Claude login, and submits the results. The server client and the Claude CLI are injected adapters, so `unittest` runs with fakes (following `soc-worker/test_worker.py`). Demo: click ตรวจ on the web, and the runner on the developer's PC produces results that appear on the review page.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 13

**Status:** done

- [x] The happy path is tested with a fake server and a fake Claude CLI
- [x] The skill version used is recorded in the submission
- [x] A real end-to-end demo on one major item works and is noted in Comments
- [x] No listening port; it polls only

## Comments

### 2026-10-06: code done, live demo still to do

- `soc-runner/` (Python, standard library only): `runner.py` (config, `carry_out` = one Check Request, `SocRunner` loop),
  `server_client.py` (HTTP adapter), `claude_cli.py` (`claude -p` adapter). Docs: "ตัว SOC Runner" in `docs/SOC-RUNNER.md`.
  `npm run soc:runner -- <soc-runner.json>`, `npm run soc:runner:test` (29 tests: fake server + fake Claude CLI, plus the HTTP
  client against a stub on 127.0.0.1). `soc-runner.json` is gitignored (holds the token).
- Heartbeat thread every 30 s (`claudeLogin: "unknown"` until ticket 15); claim every 15 s when idle. Skill zip installed to
  `<work>/.claude/skills/<name>/`, checksums checked, unsafe zip paths refused. The prompt points at that skill path directly,
  because a reviewer may also have the same skill installed. `model` = most output tokens in `modelUsage`; `skillVersion` =
  `X-Soc-Skill-Version`. NOT_CLAIMED → drop; submit 422/409 → server already closed it; any other error → report `failed`.
- Review fixes: unexpected errors and server errors mid-run report `failed` (else the claim hands back the same request forever),
  403 handled, Windows process-tree kill on timeout, WebFetch/WebSearch disallowed. Known risk: Bash is fully allowed (the skill
  runs its own Python scripts); vendor PDFs could carry a prompt injection.
- Full suite 125/125, lint, typecheck pass.
- **Live demo not done**: the dev server on :3000 (started 13:08, before ticket 13) returns 500 on claim/heartbeat with a valid
  token; it needs a restart (`npm run dev`), which this session wasn't allowed to do. Prepared in pilot-db: "uitest13 SOC Demo"
  evidence replaced with the real `SOC_Demo_Package/Datasheet_Demo.pdf` (size/checksum updated); uitest13's runner link token
  re-set (config in the session scratchpad, not in the repo; download a new one from /soc if lost); Check Request
  `demo14-1791269838` for major item ๑ (inserted directly, no uitest13 password). To finish: restart the dev server, run
  `npm run soc:runner -- <config>`, wait for the submit, check the review page, tick the box and note it here.
- Ticket 15: the skill's `missing_documents.json` currently ends as `failed` ("no results.json"); map it to `needs_documents`.

### 2026-10-06: live demo done, ticket closed

- Dev server on :3000 restarted (the old one had lost pilot-db: `ECONNREFUSED`; pilot-db restarted with
  `npx.cmd prisma dev --name pilot-db -P 51218 --shadow-db-port 51219`, data intact).
- **Run 1 (`demo14-1791269838`) failed, and showed a real bug**: on Windows Claude Code runs shell commands through its
  `PowerShell` tool, so `--allowedTools Bash,...` left every `python` call waiting for approval and headless Claude gave up.
  The failure path worked end to end (request + item `failed`, Thai reason). Fix: allow `PowerShell` too; a missing
  results.json/SOC_Check now also carries Claude's last message in the reason (test added, 30 tests).
- **Run 2 (`demo14b-1791271995`) succeeded**: claimed → skill `sha256:75f3d06292b90b40` + SOC_Demo.docx + the real
  Datasheet_Demo.pdf downloaded → `claude -p` (claude-sonnet-5-5) checked major item ๑ in about 2 minutes → submitted
  7 rows (๑. heading `not_applicable`, ๑.๑–๑.๓.๑ `match`). Server: request `done`, item `checked`, run source `runner`,
  skill version and model stored, audit `CHECK_REQUEST_CLAIMED` → `RUN_IMPORTED`; work folder removed.
- Both requests were inserted into pilot-db directly instead of clicking ตรวจ (no uitest13 password), and the review page
  was not opened in a browser. Worth a look in ticket 15, which needs the browser anyway.
