# 04: Create a build from a text TOR and download the draft

**What to build:** API to create a build: TOR PDF (text layer), page ranges (`12-40, 55-60`, error before start if invalid or beyond the last page), template from the shared list or uploaded for this build only, title defaulting to the TOR file name (duplicates allowed). Runs the builder, stores the draft and warnings, status ready. Download as `SOC-<title>.docx` with the Word MIME type, same response-helper style as the TOR Match download. Delete a build. Activity log for create / delete.

**Blocked by:** 01, 03

**Status:** done 2026-10-28

- [x] API/DB tests: create, bad range, range beyond last page, refused template, download, delete, other user's build not reachable, no SOC access refused
- [x] The draft read back by the SOC check reader gives the built rows (story 41)
- [x] lint, typecheck, tests pass

## Comments

Routes: GET/POST /api/soc/builds, DELETE /api/soc/builds/[id], GET /api/soc/builds/[id]/download. Logic lib/soc-builds.ts (parsePageRanges, createSocBuild, listSocBuilds, downloadSocBuild, deleteSocBuild); shared error helper lib/soc-builder-http.ts. Text TOR only: a scanned TOR is refused with a message until ticket 06. Owner (or ADMIN) reaches a build; others get 404. Tests: test/soc-builds.test.ts (5); full suite 466 pass.

Found while trying the user's real Apron Template: the last item ๔.๑๐.๘ swallowed the next TOR document (pages 27-39) because the test range ran past the spec. Builder now drops '- ๒๗ -' page numbers and stops, with a warning, at a heading that starts another TOR document ('เอกสาร ผนวก ข' after 'ผนวก ก'). Apron with the real template: 306 rows, 100% of item numbers, ๔.๑๐.๘ ends clean.
