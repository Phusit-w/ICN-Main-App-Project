# 04: Create a build from a text TOR and download the draft

**What to build:** API to create a build: TOR PDF (text layer), page ranges (`12-40, 55-60`, error before start if invalid or beyond the last page), template from the shared list or uploaded for this build only, title defaulting to the TOR file name (duplicates allowed). Runs the builder, stores the draft and warnings, status ready. Download as `SOC-<title>.docx` with the Word MIME type, same response-helper style as the TOR Match download. Delete a build. Activity log for create / delete.

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] API/DB tests: create, bad range, range beyond last page, refused template, download, delete, other user's build not reachable, no SOC access refused
- [ ] The draft read back by the SOC check reader gives the built rows (story 41)
- [ ] lint, typecheck, tests pass

## Comments
