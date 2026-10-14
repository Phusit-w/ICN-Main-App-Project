# 10: A SOC divided into ผนวก: each ผนวก is a major item

**What to build:** The user's decision (2026-10-14, on the MEA Y69 job page on prod): the items to check must be the ผนวก, not "ข้อ 1" split into 1.1, 1.2 … across all of them.

- A SOC is divided into ผนวก when it has at least two ผนวก heading rows: no item number, and the TOR cell starts with "ผนวก 7 …" or "ภาคผนวกที่ ๘ …". Its rows number from 1 again in every ผนวก (MEA: also under each sub-heading).
- Each ผนวก is one major item: label "ผนวก 7", key "7", title the rest of the heading row. Never split. Rows above the first ผนวก belong to no major item.
- A row's `item` in results.json is the ผนวก number, then the row's own number: ข้อ 3 of ผนวก 7 is `7.3`, ข้อ 7 is `7.7`, the heading row is `7`. A row without a number takes the number above it.
- The runner and the skill get the ผนวก as its number ("7") with "ผนวก 7 …" as the title; the skill sees in the SOC that the number is a ผนวก. No Runner change.
- Pages and messages name it "ผนวก 7", not "ข้อ ผนวก 7".

**Blocked by:** 08

**Status:** ready-for-human

- [x] Web: a SOC with two or more ผนวก gets one major item per ผนวก; a row is found by its row and its item under the ผนวก number (tests)
- [x] Web: a numbered SOC with one row that mentions a ผนวก is read as before (test)
- [x] Through the runner API: the claim names the ผนวก by its number; rows numbered under it import; a row of another ผนวก is refused (test)
- [x] Skill: the packet builder takes the rows of a ผนวก and numbers them under it (tests)
- [x] Real MEA Y69 SOC: 15 major items (ผนวก 7 to 21, 369 rows, 19 Image Rows), packets built for ผนวก 9 and 13
- [x] lint, typecheck, `npm test`, runner tests, skill tests and build pass
- [ ] On prod: new Skill Package uploaded, deployed, the MEA job created again, one ผนวก checked

## Comments

**2026-10-14: code done, the rest is the user's.** lint, typecheck and build pass; `npm test` 269/269; runner tests 119; skill tests 164.

- Web: `lib/soc-major-items.ts` (`annexItemsOfRows`), `majorItemName` / `isAnnexLabel` in `lib/soc-shared.ts` used wherever a page or message named "ข้อ <label>", `runnerMajorItem` in `lib/soc-check-requests.ts`. No migration, no Runner change (still 0.6.0).
- Skill (outside git): `annex_number`, `annex_rows` and the `relative` option of `item_numbers` / `row_items` in `scripts/build_evidence_packet.py`; one sentence on `item` in `SKILL.md`. Package `tor-word-compliance-check-2026-10-14-annex.skill` (79,107 bytes, sha256 `583d5543129a…`), not uploaded.
- Real MEA Y69 SOC through the web reader: ผนวก 7 to 21, rows 37, 37, 34, 34, 21, 22, 19, 21, 18, 22, 22, 51, 9, 14, 8; Image Rows 0, 0, 2, 2, 0, 0, 1, 2, 2, 2, 2, 4, 1, 0, 1. Packets built for ผนวก 9 (34 rows, 2 images) and 13 (19 rows, 1 image) from `C:/Phusit/MEA-Y69`.

Not done: no `/code-review` on this change, no Claude run on a ผนวก packet, and the pages were not opened in a browser.

For the user, in order: upload the package and make it current; deploy (`git pull`, `update.ps1`; nothing to migrate); delete the MEA job made today and create it again (major items are read at upload, the old job keeps "ข้อ 1.1 …"); check one ผนวก.

Known limits: the review page shows the item as `7.3` (ผนวก 7 ข้อ 3), and several rows of one ผนวก can carry the same item because MEA restarts its numbers under each sub-heading; a whole ผนวก is one request (up to 51 rows), so one check costs more quota than the 4-row "1.7" of the local runs in ticket 08; the rule needs the word "ผนวก" at the start of an unnumbered row's TOR cell, twice or more.

Local test databases: `test-db3`, `test-db4` and `test-db5` no longer start after being stopped with a kill. Start a fresh one (`npx prisma dev --name test-db6 -P 51278 --shadow-db-port 51279 -p 51277`) and stop it with `npx prisma dev stop test-db6`.
