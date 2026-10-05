# Per-app access for USER accounts

Supersedes the "every signed-in account can use everything" part of ADR 0006. On 2026-10-05 the user needed to add three accounts that may only search Project Cards, so `User.appAccess` now lists which apps a USER may open: `expense` (FA-017/018 forms, records, travel calculator), `soc`, and Project Card at one of two levels, `project-card` (view only) or `project-card-edit` (view, edit, confirm budgets). ADMIN ignores the list and may open everything. We chose a per-user list over new roles (e.g. a `SEARCH_ONLY` role) so any mix of apps needs no code change. The column defaults to every app, so accounts that existed before keep what they had.

Checked on the server, not only in the UI: pages call `requirePageAccess` (redirects to `/`), server actions and API routes call `requireAccess` / `requireSocActor` (throw `FORBIDDEN`) — see `lib/authorization.ts` and `lib/access.ts`. The sidebar and app launcher only hide what the user can't open. The check reads the user from the DB on every request, so an admin's change applies on the user's next request without signing them out. `proxy.ts` still only checks that a session exists.

The apps and their levels are one list, `APPS` in `lib/access.ts`; the Admin access dialog, the access chips and the Activity log text are built from it, so a new app is one entry there plus the checks on its own pages and actions — no migration.

Still true from ADR 0006: anyone with Project Card access, view-only included, sees every card's budget figure.
