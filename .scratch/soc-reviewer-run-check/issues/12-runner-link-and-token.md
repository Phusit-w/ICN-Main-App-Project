# 12: SOC Runner link, token and heartbeat

**What to build:** A user downloads a SOC Runner config from `/soc` that is already tied to their account (no pairing code): a per-runner token bound to exactly one user, with only a hash stored. A token-authenticated heartbeat endpoint reports the runner version and the Claude login state. The web shows whether the user's runner is online and when it was last seen. An admin can see and revoke runner links. Until ticket 16, the config is a file the runner (run from source) reads.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 04

**Status:** done

- [x] Downloading creates a token bound to the user, and only its hash is stored
- [x] A heartbeat with a valid token updates the online/last-seen state, and a revoked or unknown token is refused
- [x] The user sees the runner's online state, and an admin sees and revokes links
- [x] Audited; tests cover token binding and revocation; lint, typecheck and build pass

## Comments

### 2026-10-06 — done (commits 779a17e + review fixes)

- `SocRunnerLink` (migration `20261006200000_soc_runner_links`): token `socr_<43 base64url>`, only sha256 stored.
  **One active link per user**: downloading again revokes the old one (`revokeReason "replaced"`); recorded in ADR 0008.
- `POST /api/soc/runner-link` (session + `soc`) → `soc-runner.json` `{format: "soc-runner-config/1", serverUrl, token, linkId, username, displayName, createdAt}`.
  `serverUrl` = `SOC_RUNNER_SERVER_URL` or the request origin — **set it on the real server** (Caddy).
- `POST /api/soc-runner/heartbeat` `{runnerVersion, claudeLogin: logged_in|logged_out|unknown}`: 200 / 400 / 401 (unknown, revoked, deactivated) / 403 (no `soc`).
  `proxy.ts` lets `/api/soc-runner/*` through only with a well-formed bearer token; each route must still call
  `authenticateSocRunner()` (lib/soc-runner.ts). **Ticket 13**: put claim/download/report under `/api/soc-runner/`,
  reuse `authenticateSocRunner`, filter writes on `revokedAt: null`, and use `SOC_RUNNER_ONLINE_MS` (2 min) or similar for the stale-claim timeout.
- Online = heartbeat < 2 min old (`socRunnerState`, lib/soc-shared.ts); runner should beat every 30 s (ticket 14).
- `/soc` panel (components/SocRunnerPanel.tsx): state, last seen, version, Claude-login warning, "revoked by admin" note, download (confirm before replacing).
  `/admin/soc-runners`: list + revoke (confirm). Audit `SOC_RUNNER_LINKED` / `SOC_RUNNER_REVOKED`, atomic with the change (`writeAudit(input, tx)`).
- Tests: test/soc-runner-link.test.ts (16). Docs: docs/SOC-RUNNER.md, glossary "Runner Link".
- Checked in a browser on the dev app (pilot-db, migration applied): panel online/offline + admin revoke → heartbeat 401.
  A test link `uitest-*` for `admintest` (revoked) remains in pilot-db.
- Caddy uses `tls internal`: the runner (ticket 14) must trust that CA or the server URL must be http on the LAN.
