# 01: SOC builder module (item splitter + template filling)

**What to build:** The deep module from spec.md: one pure function (SOC Template bytes, TOR pages, page ranges) -> (Generated SOC Draft bytes, warnings, row count). Inside it: the new TOR item splitter (reuses TorPage reading, PUA/symbol normalisation and annex/major cutting from the TOR Match module, moved/exported not copied; major-item rules from the major-items module) and template filling (clone the last row per item, bold heading row per major item, columns 1-2 written, other cells emptied, Word line breaks, rest of the zip untouched, existing zip reader/writer). Template contract validation (first SOC table: item number col 1, TOR col 2) with a refusal message that names the problem. Round-trip invariant checked at build time: the SOC table reader must read back the same items, item numbers and major items; failure is a build error.

**Blocked by:** -

**Status:** ready-for-agent

- [ ] Behaviour tests through the module only, read back with the real SOC table reader: nested numbering, restart per annex, Thai digits kept, unnumbered sub-lists stay in the parent row, text tables become multi-line text, picture pages warn with item + TOR page, page ranges, PUA characters, template with cover text, invalid template refused, round-trip
- [ ] Warnings: unsplittable stretch, item with a picture, unread pages
- [ ] Shared helpers moved out of the TOR Match module without changing its tests
- [ ] lint, typecheck, tests pass

## Comments
