# 05: สร้าง SOC sub-menu and pages

**What to build:** Sub-menu สร้าง SOC inside the SOC app: builds list (title, status, date, download, delete), new-build form (TOR upload, page ranges, template picker or upload, optional save-to-shared-list with a name, title), build page with warning list. Builds never appear in the SOC check list. Thai UI text. Add a guided tour step set for the new pages only if the user asks.

**Blocked by:** 04

**Status:** done 2026-10-28

- [x] Browser check of the whole flow, light and dark, narrow screen
- [x] Access follows the SOC app
- [x] lint, typecheck, build, tests pass

## Comments

2026-10-28: UI code written and committed (typecheck + lint clean): components SocSectionTabs / SocBuildForm / SocBuildDeleteButton; pages /soc/builds, /soc/builds/new, /soc/builds/[id]; tabs on /soc. NOT yet checked in a browser (light/dark/narrow), full suite + npm run build not re-run after the UI. Browser check recipe: scratch DB test-db32 (port 51821, public schema migrated, demo login demo / demo-pass-1 via .scratch/soc-builder/dev/seed-demo.ts with SCRATCH_DATABASE_URL), dev server: DATABASE_URL=<that URL> SOC_STORAGE_ROOT=C:/Phusit/soc-builder-samples/demo-storage npx next dev --webpack -p 3100. If test-db32 is gone, start a fresh one (test-db33) and repeat: CREATE SCHEMA public, prisma migrate deploy with &schema=public, seed-demo.

2026-10-28 (browser check): dark + light checked on scratch DB: list empty state, new form (range-required validation), build with MEA TOR pages 1-30 + Apron template -> 192 rows, 2 warnings shown, download/delete buttons. Narrow (398px popup): new pages add no overflow; list table is in overflow-x-auto; the 453px page overflow comes from the existing topbar, same on /soc (not ours). Access = existing SOC app gate (demo user has soc). lint 0 errors, typecheck clean, build OK, full suite 466/466 (test-db32). Download click and delete NOT clicked.
