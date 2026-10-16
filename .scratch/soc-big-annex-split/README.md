# Split a big ผนวก into parts that can be checked

Status: needs-triage (plan only, nothing built). Found 2026-10-16 in the live USO acceptance (scanned-pdf ticket 10).

## Problem

Live USO run: ผนวก ๒ has 488 rows, one major item. The Runner's Claude read `job.md` (~515 KB) only to row 273 and refused to write `results.json` rather than send a partial judgement. Second blocker was cut off in the paste (not seen).

## What already exists (do not rebuild)

- A normal SOC's major item over `SPLIT_MAJOR_ITEM_ROWS` (60) is split on import into second-level parts (๕ → ๕.๑ … ๕.๑๕), each its own major item and Check Request (`lib/soc-major-items.ts`). The skill's packet builder takes `major_item = "๕.๕"` (`major_item_rows`).
- A re-check of picked rows (`SocCheckRequest.rowNumbers`) exists, but only for rows that already have results.
- A SOC divided into ผนวก (`annexItemsOfRows`, builder `annex_rows`) is **never split**. That is the gap.

## Decision (user, 2026-10-16): option A = automatic parts, no manual row picking

Implementation idea (reuse the split machinery instead of a new chunk queue): split a big ผนวก at its second level, like a normal item, so "ตรวจทั้งชุด" runs the parts one after another.

## Why this is not a one-file change (open points before building)

1. Rows inside a ผนวก number from 1 again; the web gives each row an item "`<annex>.<own>`" at read time, the builder only sees raw cells. A part's membership must be defined for both (web: `isItemInMajorItem`, results validation, review page grouping, results Excel labels; builder: `annex_rows` only knows a whole ผนวก).
2. Part labels and keys: ผนวก ๒ part 2.4 vs a normal item 2.4 (key clash `"2.4"`).
3. Skill package must change (builder gets a part selector) → new package upload; Runner version gate (`needsRunner`) if the Runner must know.
4. Existing annex SOCs (MEA Y69) would start splitting on new imports: decide the threshold and the ไม่ต้องตรวจ guess (`skipped`) for the parts (the normal split marks the non-spec parts skipped; annexes should not).
5. Verify the cause first: the cut-off "ติดขัดข้อ 2" text and `runner.log` (quota vs context vs time) — if it is not size, splitting will not help.

## Acceptance (draft)

- [ ] A ผนวก over the threshold is made into parts on import; a smaller ผนวก stays one item
- [ ] Each part is checkable alone; its rows are exactly its own (no rows of other ผนวก)
- [ ] ตรวจทั้งชุด runs all parts; results Excel and review page group the parts under the ผนวก
- [ ] Jobs imported before the change behave as before
- [ ] Live: USO ผนวก ๒ checks part by part and finishes
