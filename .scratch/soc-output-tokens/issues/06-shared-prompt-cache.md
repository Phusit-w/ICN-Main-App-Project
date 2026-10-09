# 06: Runner: shared prompt prefix so back-to-back items read the cache (04 option B)

**What to build:** Make the start of every packet-flow run identical, so the 2nd+ item a PC runs within an hour reads the system prompt, the skill docs and the first user message from the prompt cache instead of writing them again. Measured mechanism and numbers: ticket 04's comment (E2, E6). Expected saving ≈ 35k cache-write tokens ≈ **40k units per follow-up run (~13% of a ๕.๕ run)**; nothing for a lone item or the first item of the day.

**Blocked by:** – (04 done; user chose option B 2026-10-09)

**Status:** ready-for-agent

## What to change (Runner, `soc-runner/`)

1. **Fixed work dir.** Claude runs in `work/current` (one path for every request; runs are already serial in `SocRunner.poll_once`). The request's own folder (`work/<request id>`, keeps `run_state`, `inputs/`, `out/`, the skill) is moved into `work/current` before Claude starts and back out after the run ends for any reason (submitted, failed, paused, needs_login, needs_documents, crash). On startup, a leftover `work/current` (runner killed mid-run) is moved back to its request folder (name it from a marker file inside, e.g. `run_state` gets the request id). Resume after a pause works because sessions are stored per cwd and the cwd is always the same path.
2. **Skill docs in the system prompt** (packet flow only). The Runner concatenates the four docs the packet flow reads anyway, `SKILL.md`, `HEADLESS.md`, `references/evidence-packet.md`, `references/tor-decision.md`, from the installed skill into one file (outside `inputs/`/`out/`, e.g. `work/current/.claude/runner-system.md`), with a header that says they are already loaded and must not be Read again, and passes `--append-system-prompt-file <that file>` (`claude_cli.run_arguments`, a new `ClaudeTask` field). Same skill version → byte-identical file. Old flow (packet fallback) and resumed sessions: unchanged (no appended file; a resume keeps whatever its first run had).
3. **Identical first user message.** The packet-flow prompt (`build_prompt(packet=True)`) no longer names the item, files, rows or acknowledged-missing; those go to a file Claude reads first (e.g. `out/request.md`, written by the Runner, same Thai lines as today's prompt). The prompt itself becomes fixed text: marker, "docs are in the system prompt", "read `out/request.md` first", the `out/` and `inputs/` rules. Old-flow prompt, resume prompt and `PARTIAL_OUTPUT_NOTE` path: unchanged.
4. **Auto memory off** in the fixed dir: with one cwd every run shares `~/.claude/projects/<work-current>/memory/`, so one run's notes could leak into the next. Turn it off for the child (`work/current/.claude/settings.json` or the env/setting Claude Code 2.1.x honours; verify in the init event's `memory_paths` / that no memory file appears after a run).
5. `RUNNER_VERSION` → 0.4.0. No server or skill change needed; if HEADLESS.md's "read SKILL.md once" wording confuses the new flow, adjust the Runner's header text, not HEADLESS (older Runners still get the same HEADLESS).

## Measure (gate before release)

- Two back-to-back packet runs with the new Runner code on this PC (a `run_runner.py`-style harness in `fixtures/06-cache/`, Sonnet, compact3): ๕.๕ original then ๕.๘ R1, < 1 h apart. From the 2nd run's session log: cache write on turns 1–2 vs the first run, and total units vs g58 (813k). Quota read by the user before/after each.
- Quality: both runs pass the 03 gate keys (๕.๕: 02 key; ๕.๘ R1: 171→p.43, 172→p.47/54, 177→p.34(/37), 190→p.5, 193 no AMS licence doc); every packet page Read; validator 0 issues; Claude did not Read the four docs with the Read tool.

## Acceptance

- [ ] Runner tests (`soc-runner/test_runner.py`, `test_claude_cli.py`): request folder moved into `work/current` and back on every outcome incl. exceptions; leftover `work/current` restored on start; pause → resume runs in the same path with the same session id; appended-system-prompt file identical for two different items of the same skill version; packet prompt identical for two different items; `out/request.md` holds item, scope, rows, files, acknowledged-missing; old-flow and resume prompts unchanged; `--append-system-prompt-file` only on packet-flow first runs.
- [ ] Auto memory confirmed off in the fixed dir.
- [ ] Gate above: 2nd run cache write ≥ 30k tokens lower on its first turns than the 1st run; quality keys pass.
- [ ] `RUNNER_VERSION` 0.4.0; full Runner suite + repo `npm test` pass; installer rebuilt by `update.ps1` on deploy. **Left for the user:** push, deploy, reviewers re-paste the install command.

## Notes / risks

- Saving needs the same skill version and the same flow; a new package upload resets it once.
- The system prompt carries today's date: the first item each day pays the write.
- Absolute paths Claude writes into `out/` will say `work/current`; check nothing in the submit/import relies on the request id in a path.
- A move can fail if a file in the folder is still open (Windows); retry briefly, and if it still fails report the request as failed rather than run in a half-moved folder.

## Comments

2026-10-09 (agent): **code done, gate not run yet** (needs the user's quota readings). `soc-runner/runner.py` + `claude_cli.py`, RUNNER_VERSION 0.4.0, Runner suite 106 OK, `npm test` 211 pass.
- Fixed dir `work/current`; the marker `soc-runner-request.txt` is written into `work/<id>` *before* the move; moved back in `finally` on every outcome; leftover restored on start and before each request; a folder in `current` without a marker (a finished request a locked file kept) goes to `work/trash-*`; move fails 5x → `failed`.
- `.claude/runner-system.md` = header + the four docs, raw bytes (identical per skill version); fixed packet prompt; item lines in `out/request.md`.
- **Deviation from item 2:** a *resume* of a packet session also passes `--append-system-prompt-file` (same file). The CLI builds the system prompt per process and doesn't store it with the session, so "a resume keeps whatever its first run had" would have meant a resume without the docs. Old-flow sessions get none, first run or resume.
- Auto memory: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in `child_env`; verified on Claude Code 2.1.295: init event loses `memory_paths` (also with `autoMemoryEnabled:false` in settings). Harness also reports whether `~/.claude/projects/<…current>/memory` appeared.
- Gate harness: `fixtures/06-cache/run_cache.py` drives the real `carry_out` + `ClaudeCli` with a local stand-in server on compact3 (`--dry` checks plumbing without quota). Run: `python run_cache.py C:/Phusit/s06 g55` then `python run_cache.py C:/Phusit/s06 g58 --item ๕.๘ --r1` (< 1 h apart, quota read before/after each).
