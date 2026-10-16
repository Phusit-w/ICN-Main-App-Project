# 08: Quality warnings after the read

**What to build:** There is no per-row human confirmation, so when the read finishes the job warns about likely misreads: gaps or duplicates in item numbers, empty TOR cells, and doubled words in a cell. The warnings appear with the other upload warnings and name the rows or pages. See spec and ADR 0010.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A missing item number in a sequence and a repeated item number each produce a warning that names them
- [ ] A row whose TOR cell is empty produces a warning that names the row and page
- [ ] A cell with a word repeated twice in a row produces a warning
- [ ] A clean read produces none of these warnings
- [ ] Tests use the fake cell reader with crafted answers
