# 15: Runner special states

**What to build:** First verify how `claude -p` reports quota exhaustion and an expired login, and record the evidence in Comments. Then handle each state:

- missing cited documents: report `needs_documents` with the names, without running the rows, and let the user choose [อัปโหลดเพิ่ม] or [ตรวจต่อโดยไม่มีไฟล์นี้] (which re-issues the request with an acknowledgement);
- quota exhausted: `paused_quota` with an expected resume time, keep finished rows, and resume automatically;
- expired login: `needs_login`, told to the user on the web;
- any other failure: `failed` with a Thai reason and a retry button.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 14

**Status:** done

- [x] How the CLI signals quota and login state is verified and documented
- [x] Each state is unit-tested with fakes
- [x] Each state shows correctly on the web, with its action buttons
- [x] Continue-without-file runs and the major item gets the missing-documents banner (by server test + browser check of the banner; the user chose not to do a real Claude run, 2026-10-07)
- [x] An automatic resume after the quota pause is tested

## Comments

### 2026-10-06: code done, NOT committed (user stopped the session)

- **CLI evidence** (full text in `docs/SOC-RUNNER.md` → "Claude CLI แจ้งโควตาหมดและ login หมดอายุอย่างไร", Claude Code 2.1.291):
  - Logged out, tried for real with an empty `CLAUDE_CONFIG_DIR`: exit 1, the assistant line carries `error: "authentication_failed"`,
    and the result has `is_error: true` and "Not logged in · Please run /login". `claude auth status --json` returns `loggedIn: false`.
  - Every run emits `rate_limit_event` with `rate_limit_info.status/resetsAt/rateLimitType` (seen for real, status `allowed`).
    A used-up quota → `rejected` + error `rate_limit`. This was read from the CLI binary; a real exhausted quota was not triggered.
  - Expired login: the messages "Login expired · Please run /login" and "OAuth token revoked" come from the binary, not a real run.
  - `--resume <unknown id>` (real run): exit 1, stderr "No conversation found with session ID: …".
- **Runner** (`soc-runner/`):
  - `claude_cli.py` now uses `--output-format stream-json --verbose` with `--session-id` / `--resume`. `interpret()` sorts the
    outcome into ClaudeLoggedOut / ClaudeQuotaExhausted(resets_at) / ClaudeSessionMissing / ClaudeFailed. `billing_error` is
    `failed`. `login_state()` reads `claude auth status`.
  - `runner.py`: the work folder is named after the request id and keeps `soc-runner-run.json` (session id + skill version).
    `missing_documents.json` → `needs_documents`, with acknowledged names filtered out. Quota → `paused_quota`, resuming at the
    reset time + 2 min (30 min if the time is unknown), and the runner claims nothing until then. Expired login → `needs_login`:
    the heartbeat says `logged_out` and backs off 5 min, doubling up to 2 h. On resume it continues the same session; if that
    session is gone it starts a new one and keeps `out/`.
- **Web/server**:
  - `requestMajorItemCheck(..., { continueWithoutMissing })` + action `continueSocCheckWithoutMissing` = [ตรวจต่อโดยไม่มีไฟล์นี้].
    `acknowledgedMissing` = the item's missing names + those of the stopped request.
  - The page shows [อัปโหลดเพิ่ม] (#soc-documents), [ตรวจต่อโดยไม่มีไฟล์นี้], ตรวจใหม่ and ลองใหม่, plus a banner and the text
    "ตรวจโดยไม่มีไฟล์" for a checked item, and /login instructions.
- **Validation**:
  - Before the review fixes: npm test 126/126, lint and typecheck pass.
  - After the review fixes: runner tests 56/56.
  - Build was not run: it shares `.next` with the dev server.
  - Browser: all states, buttons and the banner were checked on the demo job, then that data was reset. Clicking
    [ตรวจต่อโดยไม่มีไฟล์นี้] was not tried in the browser (it opens window.confirm); a server test covers it.
  - Dev server on :3000 was restarted (with the user's OK) and pilot-db was started in the background.
- **Left for next session**:
  1. Run `npm test`, lint and typecheck again after the review fixes (claude_cli/runner changed after the last full run).
  2. Commit only the files of this ticket (memory note: never `git add -A`): soc-runner/{claude_cli,runner,test_runner,test_claude_cli}.py,
     lib/soc-check-requests.ts, lib/soc-shared.ts, actions/socCheckRequests.ts, components/SocJobDetail.tsx,
     components/SocRunnerPanel.tsx, test/soc-check-requests.test.ts, docs/SOC-RUNNER.md and this ticket + the board.
  3. Add to docs/SOC-RUNNER.md: `oauth_org_not_allowed` = needs_login, billing_error = failed, the session-missing fallback.
  4. Open checkbox: a real continue-without-file run with Claude (uses quota), or decide that the server test is enough.
  5. Known risk (from the review): an expired token still on disk shows `loggedIn: true`, so the runner retries needs_login every
     5→120 min until the user logs in again; it uses no quota. `paused_until` is kept in memory only, so after a restart the
     runner may claim other requests and pause them.

### 2026-10-07: validated, reviewed again, committed (3cfd470)

- Left-for-next-session items 1–3 done:
  - `npm test` 126/126, lint and typecheck pass, runner tests 57/57.
  - docs/SOC-RUNNER.md now lists `oauth_org_not_allowed` = needs_login, `billing_error` = failed (the doc used to say
    paused_quota), and the session-missing fallback.
  - Build still not run: it shares `.next` with the dev server.
- `/code-review` (Standards + Spec). Fixed:
  - Acknowledged names also match without a file extension (`Catalog A` = `catalog a.pdf`), so the reviewer can't loop on
    [ตรวจต่อโดยไม่มีไฟล์นี้] for the same file.
  - Login back-off max lowered from 2 h to 30 min. During the hold the web keeps saying logged out even after a re-login,
    so the hold must stay short.
  - `_new_run_state` helper.
- Not changed, by decision:
  - "a paused request can be claimed by the user's other PC": there is only one active link per user (ticket 12).
  - The extra English CLI text after the Thai reason in `failed` stays; it helps diagnosis.
  - The `continueSocCheckWithoutMissing` action stays separate from `requestSocCheck`: one form action per button.
- Still open (needs the user): a real continue-without-file run with Claude, which uses the reviewer's quota. The server
  test covers re-issuing with the acknowledgement and the banner, and the banner was checked in the browser 2026-10-06.
- **Next session for this ticket:** ask the user whether to do the real run.
  - If yes: on a job with a major item in `needs_documents`, press [ตรวจต่อโดยไม่มีไฟล์นี้] with the SOC Runner running.
    Check that Claude checks the rows without that file, the submit succeeds, and the item shows the banner
    "ตรวจโดยไม่มีไฟล์". Then tick the box and set Status: done.
  - If the user says the server test is enough: tick the box with a note and set Status: done.
- How to start the environment: pilot-db (`npx.cmd prisma dev --name pilot-db` as a long background task), the dev server on
  :3000, and test-db for `npm test`. test-db took about 10 minutes to start on 2026-10-07 (it loads a 670 MB
  durable-streams file), so check that port 51228 is LISTENING before running the tests.

### 2026-10-07: closed

- The user decided the server test is enough for continue-without-file: it covers re-issuing the request with the
  acknowledgement and the banner, and the banner was checked in the browser on 2026-10-06. No real Claude run was done.
- Ticket set to done.
