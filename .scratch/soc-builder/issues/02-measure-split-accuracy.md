# 02: Measure split accuracy on MEA, MOF, Apron

**What to build:** A dev script (not shipped, not CI) that builds a SOC from the MEA (text), MOF and Apron (scanned, using the cached OCR text from TOR Match) TORs and compares with their real SOCs: rows, item numbers, text. Record the numbers in Comments. Use the 2-3 sample SOC Templates the user sends. If the splitter is weak on scanned TORs, stop and revisit before any UI work (spec Further Notes).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Numbers per set (rows matched, item numbers matched, text exact / format-only / different) recorded in Comments
- [ ] Go / no-go note for the UI tickets
- [ ] Samples copied to a short folder (MAX_PATH), outside git

## Comments
