# 15: Admins keep the Category and Work Type lists

**What to build:** An admin can add a Category (also used as a Tag) or a Work Type, and rename an entry's English/Thai labels, from Admin Center — without a developer or a deploy. The lists move from code into the database, seeded with today's 12 Categories and 6 Work Types under the same values, so already-classified cards are unaffected. Requested by the user 2026-10-02 after ticket 06's deploy; decided with the user: admins only; add + rename, no delete; both Categories/Tags and Work Types.

**Blocked by:** 01, 02 (the lists and their readers)

**Status:** done

- [x] Additive migration creates `ProjectCardTerm` (kind, value, en, th, sortOrder) and seeds the 18 existing entries with their current values
- [x] Ingest, the popup's save action, the search filter, free-text matching and the popup read the table (no list left in code; Description Sources stay in code)
- [x] Admin Center page "หมวดหมู่โครงการ": add an entry (value derived from the English label), rename labels, shows how many cards use each; exact duplicates (value, English label case-insensitive, or Thai label) are refused; no delete; changes recorded in the activity log
- [x] An entry an admin adds is accepted by the next ingest push; an unknown value is still rejected (scripted check)
- [x] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass
- [x] Deployed to production (needs the user to pull + run update.ps1, as in 06)

## Two databases: keep the lists in step

Batches are written in the local `pilot-db` and then pushed to production; each database has its own copy of the lists, and nothing syncs them automatically.

- **Production is the source of truth.** Admins add or rename entries in Admin Center on production.
- **Before a batch uses a new entry, mirror it into `pilot-db`** with the same `value`, English and Thai labels (add it in the local Admin Center with the same English label, which derives the same `value`; or insert the row directly).
- **Never add an entry only in `pilot-db`**: production would reject every pushed card that uses it, and the push loses that card's Description too (the whole record is refused).
- A rename on production doesn't need mirroring for pushes to work (pushes carry `value`s, not labels), but mirror it anyway so the local review shows the same names.

## Comments

2026-10-02 — Done; deployed to production 2026-10-02 (user pulled + ran update.ps1, reported passing). Migration `20261002120000_project_card_terms` creates `ProjectCardTerm` and seeds the 18 entries (values and labels identical to the old code constants, checked in review). `lib/project-card-terms.ts` loads the lists per request; `lib/project-card-taxonomy.ts` keeps only pure helpers over a passed-in list, plus Description Sources. Admin Center tab "หมวดหมู่โครงการ" (`/admin/project-card-terms`): add + rename for both lists, card counts per entry, duplicate refusal (incl. a concurrent add hitting the unique index), activity-log rows `PROJECT_CARD_TERM_CREATED` / `_RENAMED`, and a note that renaming changes which words search matches. Scripted check: 31 checks, all pass (written first, ran red). Browser-checked as a temp ADMIN on local: add, duplicate refused, rename (value kept), the new entry usable in the popup and found by search; temp user/term/card and their audit rows removed afterwards.
