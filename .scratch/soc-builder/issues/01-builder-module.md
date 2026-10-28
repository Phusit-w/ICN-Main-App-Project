# 01: SOC builder module (item splitter + template filling)

**What to build:** The deep module from spec.md: one pure function (SOC Template bytes, TOR pages, page ranges) -> (Generated SOC Draft bytes, warnings, row count). Inside it: the new TOR item splitter (reuses TorPage reading, PUA/symbol normalisation and annex/major cutting from the TOR Match module, moved/exported not copied; major-item rules from the major-items module) and template filling (clone the last row per item, bold heading row per major item, columns 1-2 written, other cells emptied, Word line breaks, rest of the zip untouched, existing zip reader/writer). Template contract validation (first SOC table: item number col 1, TOR col 2) with a refusal message that names the problem. Round-trip invariant checked at build time: the SOC table reader must read back the same items, item numbers and major items; failure is a build error.

**Blocked by:** -

**Status:** ready-for-agent

- [ ] Behaviour tests through the module only, read back with the real SOC table reader: nested numbering, restart per annex, Thai digits kept, unnumbered sub-lists stay in the parent row, text tables become multi-line text, picture pages warn with item + TOR page, page ranges, PUA characters, template with cover text, invalid template refused, round-trip
- [ ] Warnings: unsplittable stretch, item with a picture, unread pages
- [ ] Shared helpers moved out of the TOR Match module without changing its tests
- [ ] lint, typecheck, tests pass

## Comments

2026-10-28 (after ticket 03): the user's real Apron Template.docx (blank 19 x 6 table, no header row, no text) was refused by the first contract. Contract is now: first table whose last row is empty with 2+ cells (a table with a ลำดับ / ข้อกำหนด TOR header row preferred); rows above the last text-bearing row stay, empty rows are replaced. Real Template builds 306 rows for Apron, widths kept.
