# 03: Set up the node:test harness

**What to build:** The repo has no TypeScript tests today. Add `npm test`, using Node's built-in test runner with no new test library, and a documented way to run tests against a disposable Postgres database (or a narrow store interface) so that seams 1 and 2 can be tested from the outside. Include one trivial passing test that touches the database, as proof.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 01

**Status:** done

- [x] `npm test` runs and passes
- [x] A test can create and clean up its own data without touching dev/prod data
- [x] How to run the tests is documented in the SOC docs
- [x] lint and typecheck pass

## Comments

**2026-10-06 (done).** Commits 42933e8 (harness) and the follow-up review-fix commit after it, on `codex-wip/admin-soc-2026-08-28`.
Ticket 01 was still `ready-for-human`, so this went onto the WIP branch. Only new files plus `package.json` and `.gitignore` were committed, by explicit path, so cherry-picking them onto the feature branch from 01 is clean.

- `npm test` runs `node --test` with no test library. Node 24 strips types itself. `test/resolve-ts.mjs` handles the `@/` alias, extensionless relative imports, and `next/*` (adds `.js`).
- `test/global-setup.mjs` creates one `test_run_*` schema per run on `TEST_DATABASE_URL` (local only, from `.env.test`), runs `prisma migrate deploy` into it, and drops it at the end. `test/register.mjs` binds `@/lib/prisma` to that schema, so code under test needs no changes.
- Test files call `setupTestDatabase()` from `@/test/db`. It returns `{ skip }` and truncates every table before each test.
- `--experimental-test-module-mocks` is on, so request-only Next APIs (`revalidatePath`, `cookies`, `redirect`) can be stubbed with `t.mock.module` before dynamic-importing the module under test.
- Test DB: `npx.cmd prisma dev --name test-db -P 51228 --shadow-db-port 51229 -p 51227`. Without it, DB tests skip with a warning.
- Docs: `docs/SOC-TESTING.md`. It's a new file because `SOC-COMPLIANCE.md` has uncommitted WIP. Once that WIP lands, add a link to it from `SOC-COMPLIANCE.md`.
- Known limits: `.tsx` can't load in tests, and two `npm test` runs at the same time would drop each other's schema (stale sweep). Neither matters today.
- For 04/05: keep the seam-1 import logic loadable from tests. Route handlers and actions load fine; only `.tsx` doesn't.

