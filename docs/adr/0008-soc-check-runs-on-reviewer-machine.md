# SOC checks run on the reviewer's machine; the server only stores and shows results

On 2026-10-06 the user ruled out both earlier engines: the server (192.168.51.43) cannot run a local model fast enough, and a billed API key is not affordable. The 2026-09-04 bench had already shown Sonnet via `claude -p` on a Pro subscription reaching 89% on the 12-case demo, but a personal subscription may not be logged in on a shared server to serve other people. So each reviewer runs the check on their own machine, on their own Claude Pro subscription, through the **SOC Runner**. A reviewer clicks "check" on `/soc`. Their SOC Runner fetches the files and the current skill from the server, runs `claude -p` with the skill under that reviewer's login, and uploads `results.json` and the `SOC_Check` document back. The server never calls Claude or any other model. It stores the results, shows the rows for human review (`NEEDS_REVIEW → CONFIRMED`) and lets the team download the result.

Using the SOC Runner should be one download and one install. The download is made for the signed-in web user and already carries their pairing token. The installer bundles the Python runtime, installs Claude Code silently, installs per user (no admin rights) and starts at login. The only step the reviewer must do themselves is the one-time Claude login in the browser, because it is their own account.

## Considered Options

- **Server-side worker with a billed API** (the existing `soc-worker` + `ai_provider.py`): rejected because of cost.
- **Local model on the server**: rejected because the hardware can't run it.
- **One person's subscription on the server, or a shared account**: rejected because a personal subscription can't be shared that way.
- **Only the user runs checks, and the team queues work for them**: works, but the user becomes the bottleneck.
- **claude.ai + uploaded skill (no install)**: nothing to install, but each check means downloading a package, dragging it into claude.ai and dragging the result back. Rejected for convenience. It also wasn't tested whether the skill's scripts run there.
- **Manual upload of results from Claude Code**: too many steps for reviewers. It stays as the fallback while the SOC Runner is being built.

## Consequences

- An uploaded check is a `SocJob` of a new "imported" kind (same pattern as ADR 0002). It starts at `NEEDS_REVIEW` and skips `QUEUED`/`PROCESSING`. `soc-worker` is not needed for it.
- The server holds the skill, and the SOC Runner fetches the current version for each run. Every result still records the skill version and model it came from.
- A check request belongs to the reviewer who clicked it. Only that reviewer's SOC Runner may take it, because any other machine would spend someone else's subscription. If their machine is off, the request waits.
- The installer is unsigned unless a code-signing certificate is bought, so Windows SmartScreen will warn on first install, or IT must allowlist it.
- Company machines give reviewers no admin rights (confirmed 2026-10-06). So every part of the install must work without admin: the bundled runtime, Claude Code, Git if Claude Code still needs it on Windows, and autostart (per-user Run key or Startup folder). If IT enforces AppLocker or WDAC rules that block programs in user folders, the SOC Runner can't run without an IT exception.
- No rule-based pre-check runs on the server. Every check result comes from Claude, so reviewers see one source of findings.
- A large SOC is checked in batches, one per major item (ข้อใหญ่). The batches land in the same job.
- Every reviewer who runs checks needs their own Claude subscription. That cost moves from the server to each person.
- A user has one SOC Runner link (one machine) at a time. Downloading the runner config again replaces the link and stops the old config at once, so reinstalling or moving to a new PC needs no admin, and a lost PC's config dies with the next download (decided in ticket 12, 2026-10-06; spec story 43). A reviewer who needs two machines at once would need this changed.
