# 03: No item-number column: the item number comes from the TOR text

**What to build:** A text PDF SOC whose table has no item-number column, with the number written at the start of the requirement ("๔.๓.๑ การเริ่มจัด…"), still splits into major items and is checked like any other SOC. See `.scratch/soc-pdf-soc/spec.md` (Converter rules) and the PDF SOC glossary entry.

**Blocked by:** 01

**Status:** done

- [x] When the header has no item column, a row's item number is the leading dotted number of its TOR text, in Thai or Arabic digits, kept as typed.
- [x] The number is written into the item column of the generated `.xlsx` and also stays in the TOR text, so the skill needs no change.
- [x] Rows with no leading number are unnumbered rows under the numbered row above them.
- [x] When an item column exists, it is always used, and numbers inside the TOR text are ignored.
- [x] Major items follow the existing rule (including the over-60-row split) on such a SOC.
- [x] Tests at the converter seam cover a table without an item column, and a table with an item column whose TOR text also starts with a number.

## Comments

2026-10-14 (done, committed, not pushed):
- The header finder (`findSocHeader` in `lib/soc-table-excel.ts`) has a `needsItem: false` mode: a header named by its TOR and proposal columns alone. The Excel reader still needs an item column (out of scope here).
- The converter looks for an item-less header only while no header with an item column is known. So a SOC with an item column never falls back to it, and an item number inside the TOR text is ignored there.
- Once the header is item-less, a later page's header must repeat its text exactly. Otherwise a data row that only reads like a header ("ตามที่กำหนด" | "ผู้เสนอ") at the top of a page would be taken for one.
- Without an item column, a title merged across the table is not taken for the header, because it would name the TOR and proposal columns at once.
- Item number = the leading dotted number of the TOR text, kept as typed: `๔.`, `๔.๓.๑`, `4.3.2`. A number without a dot (`10 ช่องสัญญาณ`) is not an item number, so the row is unnumbered. A TOR text that starts with a decimal value (`2.5 GHz …`) would be read as item 2.5; this is accepted, since such SOCs start their TOR text with the item number.
- The PDF "no table" message no longer lists ลำดับ as required.
- Remaining risk: in an item-less SOC, a cover page whose table has cells that read like TOR and proposal names would be taken for the header. Then the real header on the next page would not match it and would be read as rows. The item-column case has the same kind of risk with ลำดับ.
- Code review (open, accepted for now): with no item column, a row continued from the previous page whose text starts with a decimal value ("1.5 เมตร…") would be numbered 1.5. Once a header with an item column is known, a later table without one (another ผนวก) is read with the old columns. Unnumbered forms are `๔ ` (no dot), `(๑)`, `ข้อ ๔.๓` and `4)`. A repeated header is compared with its spaces taken out, so a different line break inside a header cell still matches.
- Manual check: Surat (`C:\Phusit\socpdf\surat.pdf`, which has an item column) converts identically to the 01/02 output.
