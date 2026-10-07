# 16: Installer that needs no admin rights

**What to build:** Package the SOC Runner as a Windows `.exe` and build an installer that a reviewer downloads from `/soc`, already carrying their token. It installs entirely in the user profile with no admin rights: it bundles the runtime, installs Claude Code silently (plus a portable Git if Claude Code still needs it), registers per-user autostart, and opens the Claude sign-in once. Re-downloading and installing again repairs a broken install. The download page explains the SmartScreen warning in Thai. It must be checked by hand on a real company PC.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 14 (and IT's answer on AppLocker/WDAC and unsigned installers)

**Status:** ready-for-human (code done and smoke-tested 2026-10-07; the manual company-PC test below is the user's)

- [x] IT's answer is recorded in Comments before the build starts
- [ ] On a company PC without admin rights: download, install, sign-in and the first check all work with no other steps
- [ ] The runner starts again after a reboot
- [x] Re-installing repairs a broken install
- [x] The SmartScreen explanation is on the download page
- [ ] The manual test steps and results are written in Comments

## Comments

**2026-10-07: self-check on one company PC (icn21\phusit.w, domain icn21.local, not admin, not elevated).** This is not IT's official answer.

- **AppLocker:** the effective policy is empty (`<AppLockerPolicy Version="1" />`). The SRP `Safer\CodeIdentifiers` key exists, but it has no level and no rules. AppIDSvc is running.
- **WDAC / CI:** user-mode and kernel code integrity are both reported as enforced (status 2), with 8 active `.cip` policies. Smart App Control `VerifiedAndReputablePolicyState=1`. These look like Windows' default policies.
- **Unsigned `.exe` from `%LOCALAPPDATA%`** (built locally with csc, `NotSigned`) ran fine from the console. A copy marked as downloaded from the internet (Zone.Identifier ZoneId=3) also ran fine.
- **Per-user autostart:** writing a value to `HKCU\...\Run` and a file to the Startup folder both worked. No `DisableCurrentUserRun` policy is set. Existing HKCU Run entries are OneDrive, Claude, Teams, Docker Desktop and GoogleUpdater.
- All test artifacts were removed afterwards.
- **Not tested** (needs a person and the GUI):
  - the browser's download warning on an unsigned `.exe`
  - SmartScreen "Windows protected your PC" when the installer is double-clicked in Explorer
  - whether other PCs or OUs get a different GPO
- **IT's answer (relayed by the user, 2026-10-07): no plans to change the policy.** That unblocks the build. Unsigned distribution and a test PC were not asked about separately. Treat the self-check above as the baseline, and the manual test on a company PC is still required.
- Originally asked IT: will policy change soon (AppLocker/WDAC rollout)? Is distributing an unsigned internal tool allowed? Can we have one standard non-admin PC to test on?

### 2026-10-07: built, and smoke-tested by the agent on this company PC

**What was built** (details: `docs/SOC-RUNNER.md`, "ตัวติดตั้ง"):

- `SOCRunnerSetup.exe` (~39 MB) = a small C# stub (`soc-runner/installer/SocRunnerSetup.cs`, compiled with the csc that
  ships with Windows, manifest `asInvoker`) + an embedded payload: Python 3.12.10 (NuGet `python`, sha256 pinned) with
  python-docx / PyMuPDF / openpyxl (`installer/requirements.txt`) + the runner. `npm run soc:runner:build`.
- `/soc` → **ดาวน์โหลดตัวติดตั้ง SOC Runner** (`POST /api/soc/runner-installer`): the server appends the user's runner
  config (a new link; the old one is replaced) to the prebuilt installer at `SOC_RUNNER_INSTALLER_PATH`
  (default `<SOC_STORAGE_ROOT>/runner/SOCRunnerSetup.exe`). No installer on the server → 503 and the link is untouched.
  Optional `SOC_RUNNER_CA_CERT_FILE` puts the server's root CA (Caddy `tls internal`) into every config as `caCert`.
- The stub stops a running runner (tree-kill), unpacks a fresh `%LOCALAPPDATA%\SOCRunner\app` (the repair), writes
  `soc-runner.json`, and runs `install.py`: Claude Code native build (downloaded + sha256-checked, `claude.exe install
  stable`) unless a working one exists → `~/.local/bin` on the user PATH → HKCU Run `SOCRunner` → `claude auth login`
  in its own window if not signed in → starts the runner on `pythonw.exe` with `--log runner.log` (one at a time, `runner.lock`).
- **Deviation from the ticket text:** the runner is not a separate `.exe`; it runs on the bundled `pythonw.exe`,
  because the skill's scripts need that same Python with python-docx/PyMuPDF (the runner puts it first on the PATH it
  gives `claude`). Only the installer is an `.exe`.
- **No Git:** Claude Code 2.1.292 ran `claude -p` with no Git on PATH and no `CLAUDE_CODE_GIT_BASH_PATH` (tested
  2026-10-07), so no portable Git is bundled.
- Lessons from the user's earlier no-admin installs (`ICN Apps/Problem/*.md`): the installer never runs a `.ps1`
  (Execution Policy can't block it), never needs Node, and adds `~/.local/bin` to the user PATH itself (the native
  Claude install doesn't), so "open claude and type /login" works after a login expires.

**Agent smoke test on this PC** (icn21\phusit.w, not admin; Claude Code already installed and signed in), against the
dev server (:3000, pilot-db), user `uitest13`:

1. Downloaded the installer through the real route (session for uitest13): 200, 38.6 MB, config appended.
2. Marked it as from the internet (Zone.Identifier ZoneId=3) and ran it **from a console** (so no SmartScreen GUI):
   exit 0. Claude Code found (`~/.local/bin/claude.EXE`), Run key written, sign-in skipped (already signed in),
   runner started as `pythonw.exe` from `app\python`, no window. Heartbeat: link online, 0.2.0, `logged_in`; the old link revoked (`replaced`).
3. Check Request `demo16-1791359877151` for ๑ (inserted into pilot-db as a click on ตรวจ would; no uitest13 password):
   claimed 14:58:06, `claude -p` ran, **6 rows submitted 15:00:52**; request `done`, item `checked`, work folder removed.
4. Repair: deleted `app\runner\server_client.py` and `app\python\Lib\site-packages\docx`, downloaded again, installed
   again: the running runner was stopped (new PID), both files back, the old token refused (`401` in the log), new runner online.
5. Cleaned up: runner stopped, Run value and `%LOCALAPPDATA%\SOCRunner` removed. A copy of the installer stays in the
   dev storage (`data/soc/runner/`, gitignored) for the manual test.
6. `/soc` panel checked in Chrome (signed in as `User`, revoked-link state): install button, source-config link and the
   Thai SmartScreen steps render.

**Not covered by the agent** (still the user's, on a company PC, by hand):

- a PC **without** Claude Code: the 200 MB download, `claude install`, and the sign-in window + browser login;
- Edge/Chrome's download warning and SmartScreen "Windows protected your PC" on a double-click from Explorer;
- autostart after a reboot;
- Defender/AV reaction to the unsigned installer;
- prod: copy the built installer to `<SOC_STORAGE_ROOT>\runner\SOCRunnerSetup.exe` on the server (see below).

**Manual test steps (fill in the results here):**

1. On the dev PC: `npm run soc:runner:build`; copy `soc-runner\dist\SOCRunnerSetup.exe` to the server's
   `<SOC_STORAGE_ROOT>\runner\SOCRunnerSetup.exe`.
2. On a company PC without admin, preferably one without Claude Code: sign in to `/soc`, click ดาวน์โหลดตัวติดตั้ง.
   Note the browser warning → Keep.
3. Double-click in Explorer. Note SmartScreen → More info → Run anyway. No UAC prompt must appear.
4. Watch the console: Claude Code download, the sign-in window → sign in with your own Claude account → "ติดตั้งเสร็จแล้ว".
5. `/soc` shows ออนไลน์ and ล็อกอิน Claude แล้ว. Click ตรวจ on one major item → it becomes ตรวจแล้ว and the rows show.
6. Reboot, sign in to Windows, wait a minute: `/soc` shows ออนไลน์ again.
7. Break it (delete `%LOCALAPPDATA%\SOCRunner\app\runner\runner.py`), download + install again: online again.

**2026-10-07: review fixes** (`/code-review`, standards + spec):

- No-Git evidence strengthened: with neither Git nor bash on PATH, headless `claude -p` ran `python` through its
  shell tool (`PY (3, 12)`, no permission denials). The full skill check above ran on a PC that has portable Git, so the
  manual test should still prefer a PC without Git.
- The runner process is now `SOCRunner.exe` (a copy of the bundled `pythonw.exe`), so Task Manager doesn't show a bare
  Python. Re-installed on this PC: runs as `app\python\SOCRunner.exe`, heartbeats; starting the Run-key command again
  while it runs leaves one copy (`runner.lock`). Cleaned up again.
- Lock taken before the log is opened; the log also rotates while the runner runs; `runner.lock`/`runner.log` gitignored.
- `/soc`: the bare-config link is ADMIN-only (one stray click would replace a reviewer's installed runner); the steps
  add Edge's "Show more → Keep anyway" and "delete the downloaded file after installing" (it holds the token), and so
  does the installer's final message.
- Known, by design (ADR 0008 one-link-per-user): the old link is revoked at download, not at install. The Claude
  download trusts downloads.claude.ai (sha256 from the same origin's manifest), like the official install.ps1.

**2026-10-07: prod runs natively, not on Docker.** The user reports Docker Desktop fails on every company PC
("Virtualization support not detected", disabled by IT). Prod follows `docs/DEPLOY-WINDOWS.md` (Node, `http://<ip>:3000`,
no Caddy). So `SOC_RUNNER_CA_CERT_FILE` isn't needed (the runner uses plain `http://` on the LAN, like the web's own
session cookie) and `SOC_RUNNER_SERVER_URL` defaults to the page's origin. Putting the installer on prod is one copy
into `<SOC_STORAGE_ROOT>\runner\`. `docs/SOC-RUNNER.md` and `DEPLOY-WINDOWS.md` now say so; the Docker path is kept as the
alternative. The installer itself never needed Docker or virtualization.

**2026-10-07: correction, prod is HTTPS behind IIS.** Prod is deployed with `git pull` + `deploy\windows\update.ps1`
(user). `docs/SESSION-LOG-2026-08-19.md`: IIS + ARR reverse proxy on 443 with a self-signed certificate; port 3000
only reachable from the server's own LAN (IT opens 80/443/3389). Probed from this PC: `https://psaidemo.icn21.local`
fails verification in both Windows and Python (`CERTIFICATE_VERIFY_FAILED`, issuer = subject, expires 2027-08-19);
with that certificate as `caCert` the runner's HTTPS client connects (307 from prod, which doesn't have the runner
API yet). So the note above ("no CA or server URL needed") was wrong. Now:

- `update.ps1` step 6b builds the installer with `build.py --deploy-to <path>` only when its sources changed
  (`.sources-sha256` marker), and only warns if that fails. Tested locally: first run built and placed it (32 s),
  second run skipped (0 s). `test_build.py` covers the skip/rebuild rule.
- One-time `.env` on the server: `SOC_RUNNER_SERVER_URL="https://psaidemo.icn21.local"` and `SOC_RUNNER_CA_CERT_FILE`
  pointing at the IIS certificate exported as PEM (command in `docs/SOC-RUNNER.md`; the export recipe was checked
  against the real certificate: the app's PEM check and the runner's TLS both pass).
- Risk spotted: without `SOC_STORAGE_ROOT` in the server's `.env`, SOC files live under `.next\standalone\data\soc`,
  which `next build` recreates. Not checked on the server.

**Manual test step 1 is now:** on the server, add the two `.env` lines (and the PEM), then `git pull` +
`.\deploy\windows\update.ps1`; check step 6b says "deployed …SOCRunnerSetup.exe".
