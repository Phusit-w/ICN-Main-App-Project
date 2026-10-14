# 03: No item-number column: the item number comes from the TOR text

**What to build:** A text PDF SOC whose table has no item-number column, with the number written at the start of the requirement ("๔.๓.๑ การเริ่มจัด…"), still splits into major items and is checked like any other SOC. See `.scratch/soc-pdf-soc/spec.md` (Converter rules) and the PDF SOC glossary entry.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] When the header has no item column, a row's item number is the leading dotted number of its TOR text, in Thai or Arabic digits, kept as typed.
- [ ] The number is written into the item column of the generated `.xlsx` and also stays in the TOR text, so the skill needs no change.
- [ ] Rows with no leading number are unnumbered rows under the numbered row above them.
- [ ] When an item column exists, it is always used, and numbers inside the TOR text are ignored.
- [ ] Major items follow the existing rule (including the over-60-row split) on such a SOC.
- [ ] Tests at the converter seam cover a table without an item column, and a table with an item column whose TOR text also starts with a number.

## Comments
