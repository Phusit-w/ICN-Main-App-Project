// The SOC builder (docs/SOC-DOMAIN-GLOSSARY.md "สร้าง SOC"): a SOC Template
// (.docx), the pages of a TOR and the page ranges the user chose in; a
// Generated SOC Draft (.docx), its warnings and its row count out. Pure: no
// I/O, no AI. Reading the TOR (text layer or OCR) and storing files wrap this.
//
// Two parts: the item splitter turns the chosen pages into one row per
// numbered TOR item (an unnumbered sub-list stays inside its parent's row),
// and the template filling clones the template table's last row per item.
// The draft is read back with the real SOC table reader (lib/soc-table.ts)
// before it is returned: the SOC check must see the same rows, item numbers
// and major items, or the build fails.
import { majorItemsOfRows } from "@/lib/soc-major-items";
import { toArabicDigits } from "@/lib/soc-shared";
import { readSocTable } from "@/lib/soc-table";
import { ITEM_NAME, TOR_NAME } from "@/lib/soc-table-excel";
import { ANNEX_LINE, thaiText, type TorPage } from "@/lib/soc-tor-match";
import { decodeXml } from "@/lib/xml";
import { readZip, writeZip, type ZipEntry } from "@/lib/zip";

// Inclusive, 1-based TOR page numbers.
export type PageRange = readonly [from: number, to: number];

export type SocDraft = { bytes: Uint8Array<ArrayBuffer>; warnings: string[]; rowCount: number };

const WORD_DOCUMENT = "word/document.xml";
const UNREADABLE_TEMPLATE = "ไม่สามารถอ่านไฟล์เทมเพลต SOC ได้ กรุณาใช้ไฟล์ Word (.docx) ที่ถูกต้อง";
const NO_TEMPLATE_TABLE = "ไม่พบตาราง SOC ในเทมเพลต: ต้องมีตารางที่แถวสุดท้ายเป็นแถวว่าง และมีอย่างน้อย 2 คอลัมน์ (คอลัมน์ 1 = เลขข้อ, คอลัมน์ 2 = ข้อกำหนด TOR)";
const NO_ITEMS = "ไม่พบข้อที่มีเลขกำกับ (เช่น ๔.๓.๑) ในหน้า TOR ที่เลือก กรุณาตรวจช่วงหน้า";
const NOT_READABLE_BACK = "สร้าง SOC ไม่สำเร็จ: ระบบตรวจ SOC อ่านแถวของไฟล์ที่สร้างไม่ตรงกับที่สร้าง (เทมเพลตนี้อาจใช้ไม่ได้) กรุณาติดต่อผู้ดูแลระบบ";

// ------------------------------------------------------------ the splitter

// A SOC row to write: the item number as the TOR writes it (empty for a ผนวก
// heading), its text lines, the first TOR page, and whether it is a heading.
// `style`: the look of a row above the first item — "title" (one cell across the
// whole table, centred, bold, first line underlined) or "underlined" (a
// heading row with underlined text).
type Row = { item: string; lines: string[]; heading: boolean; page: number; picture: boolean; style?: "title" | "underlined" };

// "๔.๓.๑ …", "๕. …", "## ๕. …"; the text after the number may be empty.
const ITEM_LINE = /^[#*\s]*([0-9๐-๙]+(?:\.[0-9๐-๙]+)*)(\.?)(?:\s+(.*))?$/;
// A page number the TOR prints between dashes ("- ๒๗ -"), and the heading of a
// TOR document ("เอกสาร ผนวก ข") with the annex it names.
const DASHED_PAGE_NUMBER = /^[-–]\s*[0-9๐-๙]+\s*[-–]$/;
const DOCUMENT_HEADING = /^[#*\s]*เอกสาร\s*(?:ภาค)?\s*ผนวก\s*([ก-ฮ]|[0-9๐-๙]+)/;
// A sub-line the real SOC keeps as a row of its own under the item it belongs
// to: a dash bullet ("- มุมมองปกติ…", no item number) or a list item ("๑) …",
// item "๑)"). Any other unnumbered line wraps the item before it.
const SUB_LINE = /^(?:[-–•]\s+(.+)|(\(?[0-9๐-๙]+\))\s*(.*))$/;
const XML_UNSAFE = /[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]/g;

const compareNumbers = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

function pageNumbers(ranges: readonly PageRange[]): number[] {
  const pages = new Set<number>();
  for (const [from, to] of ranges) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) throw new Error(`ช่วงหน้า ${from}-${to} ไม่ถูกต้อง`);
    for (let page = from; page <= to; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function splitItems(pages: TorPage[], ranges: readonly PageRange[]): { rows: Row[]; warnings: string[] } {
  const rows: Row[] = [];
  const unread: number[] = [];
  const introText = new Set<number>(); // pages with text before the first item
  let started = false; // a numbered item or a ผนวก heading has been read
  let titleOpen = false; // the title row above the first item may still take its second line
  const loosePictures: number[] = [];
  let current = null as Row | null;
  // The numbering state restarts under every ผนวก heading. `major` and
  // `list` follow lib/soc-major-items.ts: "N." starts major item N only when
  // N is past the current one and doesn't run on a list (the last list row
  // was not N−1); otherwise it is a list row inside the current item.
  let last: number[] | null = null;
  let major: number | null = null;
  let list: number | null = null;

  // Under a ผนวก the TOR numbers its items from 1 again under every
  // unnumbered sub-heading ("ความต้องการ", "โครงสร้าง"), so there "N." is an
  // item when it restarts at 1 or follows the last number.
  let annexed = false;
  let document: string | null = null; // the TOR document the first heading names
  let stoppedAt: { page: number; line: string } | null = null;

  const accepts = (numbers: number[]): boolean => {
    const [first] = numbers;
    if (numbers.length === 1) {
      const isItem = annexed ? first === 1 || first === (last?.[0] ?? 0) + 1 : major === null || (first > major && list !== first - 1);
      if (!isItem) {
        list = first;
        return false;
      }
    } else if (major !== null) {
      // A dotted number is an item when it comes after the last one in the
      // current major item, or opens the next one ("34.8 มิลลิเมตร" is not).
      const after = first === major && last !== null && compareNumbers(numbers, last) > 0;
      if (!(after || first === major + 1 || (annexed && first === 1))) return false;
    }
    major = first;
    list = null;
    last = numbers;
    return true;
  };

  for (const page of pageNumbers(ranges)) {
    if (stoppedAt) break;
    const read = pages[page - 1];
    if (!read || (!read.picture && !read.text.trim())) {
      unread.push(page);
      continue;
    }
    const before = current;
    for (const raw of thaiText(read.text).split("\n")) {
      const line = raw.replace(XML_UNSAFE, "").trim();
      if (!line || DASHED_PAGE_NUMBER.test(line)) continue;
      // Another TOR document starts (ผนวก ก, then "เอกสาร ผนวก ข"): what follows is not this SOC's.
      const heading = DOCUMENT_HEADING.exec(line)?.[1];
      if (heading) {
        document ??= heading;
        if (heading !== document && started) {
          stoppedAt = { page, line };
          break;
        }
      }
      if (ANNEX_LINE.test(line)) {
        current = { item: "", lines: [line], heading: true, page, picture: read.picture };
        rows.push(current);
        started = true;
        last = major = list = null;
        annexed = true;
        continue;
      }
      const match = ITEM_LINE.exec(line);
      const numbers = match && (match[1].includes(".") || match[2]) ? match[1].split(".").map((n) => Number(toArabicDigits(n))) : null;
      if (match && numbers && accepts(numbers)) {
        current = { item: match[1] + match[2], lines: match[3] ? [match[3]] : [], heading: numbers.length === 1, page, picture: read.picture };
        rows.push(current);
        started = true;
      } else if (started && current) {
        const sub = SUB_LINE.exec(line);
        if (sub) {
          current = { item: sub[2] ?? "", lines: [sub[1] ?? sub[3]].filter(Boolean), heading: false, page, picture: false };
          rows.push(current);
        } else {
          current.lines.push(line);
        }
      } else {
        // Text above the first item: the TOR document's title (its "เอกสาร ผนวก …" heading and the bold line
        // after it) is one title row; other bold lines are underlined; the rest is a plain row per line.
        const text = line.replace(/^[#*\s]+|[*\s]+$/g, "");
        if (text) {
          const bold = /^\s*\*\*.*\*\*\s*$/.test(line);
          const title = rows.findLast((row) => row.style === "title");
          if (title && titleOpen && bold && title.lines.length < 2) {
            title.lines.push(text);
            if (title.lines.length === 2) titleOpen = false;
          } else {
            const isTitle = !title && DOCUMENT_HEADING.test(text);
            titleOpen = isTitle;
            current = { item: "", lines: [text], heading: true, page, picture: false, style: isTitle ? "title" : bold ? "underlined" : undefined };
            rows.push(current);
          }
          introText.add(page);
        }
      }
    }
    // A picture page that starts no item continues the item before it.
    if (read.picture && current === before) {
      if (current) current.picture = true;
      else loosePictures.push(page);
    }
  }

  if (!started) throw new Error(NO_ITEMS);
  const named = (pages: number[]) => pages.map((page) => `หน้า ${page}`).join(", ");
  const warnings = [
    ...(introText.size ? [`ข้อความก่อนข้อแรก (${named([...introText])}) ใส่เป็นแถวบนสุดของ SOC แถวละบรรทัด ไม่มีเลขข้อ กรุณาตรวจและจัดรูปแบบเอง`] : []),
    ...(loosePictures.length ? [`${named(loosePictures)} ของ TOR เป็นรูปภาพก่อนข้อแรก ไม่ได้ใส่ใน SOC กรุณาตรวจเอง`] : []),
    ...rows.filter((row) => row.picture).map((row) => `${row.item ? `ข้อ ${row.item}` : row.lines[0]} (หน้า ${row.page} ของ TOR) มีรูปภาพ กรุณาวางรูปใน Word เอง`),
    ...(stoppedAt ? [`ตั้งแต่หน้า ${stoppedAt.page} ของ TOR ขึ้นเอกสารใหม่ ("${stoppedAt.line.slice(0, 40)}") จึงหยุดสร้างตรงนั้น ข้อความหลังจากนี้ไม่ได้ใส่ใน SOC`] : []),
    ...(unread.length ? [`อ่าน ${named(unread)} ของ TOR ไม่ได้ (ไม่มีข้อความ) ข้อที่อยู่ในหน้านี้จะไม่อยู่ใน SOC`] : []),
  ];
  return { rows, warnings };
}

// ------------------------------------------------------- the template table

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TABLE_TAG = /<(\/?)w:(tbl|tr|tc)(?=[\s/>])[^>]*?(\/?)>/g;
type Span = readonly [start: number, end: number];

// The `tag` elements directly inside xml[from, to): a table's rows, a row's
// cells, or (whole document) the top-level tables.
function childElements(xml: string, from: number, to: number, tag: "tbl" | "tr" | "tc"): Span[] {
  const found: Span[] = [];
  const tokens = new RegExp(TABLE_TAG.source, "g");
  tokens.lastIndex = from;
  let depth = 0;
  let start = 0;
  for (let match = tokens.exec(xml); match && match.index < to; match = tokens.exec(xml)) {
    const [token, closing, name, selfClosing] = match;
    if (selfClosing) {
      if (depth === 0 && name === tag) found.push([match.index, match.index + token.length]);
    } else if (!closing) {
      if (depth === 0 && name === tag) start = match.index;
      depth++;
    } else if (--depth === 0 && name === tag) {
      found.push([start, match.index + token.length]);
    }
  }
  return found;
}

const inside = (xml: string, [start, end]: Span, tag: string): Span => [xml.indexOf(">", start) + 1, end - `</w:${tag}>`.length];

const cellText = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1])).join("").replace(/\s+/g, " ").trim();

// keepEnd: where the rows kept from the template (title / header rows) end.
type TemplateTable = { tableStart: number; keepEnd: number; tableEnd: number; pattern: string };

// The template table is the first top-level table whose last row is empty and
// has at least two cells (item number, TOR): that row is the pattern for every
// row. A table with a header row named ลำดับ | ข้อกำหนด TOR comes first, so a
// cover table above it is never taken. The rows above the last text-bearing
// row (title and header rows) stay; empty rows after them are replaced.
function findTemplateTable(xml: string): TemplateTable {
  const found: (TemplateTable & { named: boolean })[] = [];
  for (const table of childElements(xml, 0, xml.length, "tbl")) {
    const rows = childElements(xml, ...inside(xml, table, "tbl"), "tr");
    if (!rows.length) continue;
    const pattern = xml.slice(...rows[rows.length - 1]);
    const cells = childElements(pattern, ...inside(pattern, [0, pattern.length], "tr"), "tc");
    if (cells.length < 2 || cellText(pattern)) continue;
    const named = rows.some((row) => {
      const [first, second] = childElements(xml, ...inside(xml, row, "tr"), "tc");
      return second && ITEM_NAME.test(cellText(xml.slice(...first))) && TOR_NAME.test(cellText(xml.slice(...second)));
    });
    const lastText = rows.slice(0, -1).findLastIndex((row) => cellText(xml.slice(...row)));
    found.push({ named, tableStart: table[0], keepEnd: lastText < 0 ? rows[0][0] : rows[lastText][1], tableEnd: rows[rows.length - 1][1], pattern });
  }
  const table = found.find((t) => t.named) ?? found[0];
  if (!table) throw new Error(NO_TEMPLATE_TABLE);
  return table;
}

function readTemplate(template: Uint8Array): { entries: ZipEntry[]; xml: string } {
  let entries: ZipEntry[];
  try {
    entries = readZip(template);
  } catch {
    throw new Error(UNREADABLE_TEMPLATE);
  }
  const document = entries.find((entry) => entry.name === WORD_DOCUMENT);
  if (!document) throw new Error(UNREADABLE_TEMPLATE);
  return { entries, xml: document.data.toString("utf8") };
}

// Throws, with a message for the user, when the template can't be filled and
// read back by the SOC check: no table whose last row is an empty row of at
// least two cells to use as the pattern.
export function assertSocTemplate(template: Uint8Array): void {
  findTemplateTable(readTemplate(template).xml);
}

// ----------------------------------------------------------------- filling

// The run properties with bold and/or underline added where the schema puts
// them: bold after rStyle and rFonts, underline before the language.
function styledRPr(rPr: string, { bold = false, underline = false } = {}): string {
  if (!bold && !underline) return rPr;
  const inner = rPr.replace(/^<w:rPr>|<\/w:rPr>$/g, "").replace(/<w:(?:b|bCs|u)(?:\s[^>]*)?\/>/g, "");
  const lead = /^(?:<w:rStyle\b[^>]*\/>)?(?:<w:rFonts\b[^>]*\/>)?/.exec(inner)![0];
  let rest = inner.slice(lead.length);
  if (underline) {
    const at = rest.search(/<w:lang\b/);
    rest = at < 0 ? `${rest}<w:u w:val="single"/>` : `${rest.slice(0, at)}<w:u w:val="single"/>${rest.slice(at)}`;
  }
  return `<w:rPr>${lead}${bold ? "<w:b/><w:bCs/>" : ""}${rest}</w:rPr>`;
}

// The paragraph properties centred, before the run properties as the schema wants.
function centred(pPr: string): string {
  const without = pPr.replace(/<w:jc\b[^>]*\/>/g, "");
  if (!without) return '<w:pPr><w:jc w:val="center"/></w:pPr>';
  const at = without.search(/<w:rPr>/);
  return at < 0 ? without.replace("</w:pPr>", '<w:jc w:val="center"/></w:pPr>') : `${without.slice(0, at)}<w:jc w:val="center"/>${without.slice(at)}`;
}

type CellLook = { bold?: boolean; underline?: boolean; centre?: boolean; paragraphs?: boolean };

// An empty copy of a template cell (its properties, paragraph and font kept)
// holding `lines`: one Word line break between them, or a paragraph each.
function fillCell(cell: string, lines: string[], look: CellLook = {}): string {
  const open = /^<w:tc\b[^>]*>/.exec(cell)![0];
  const content = cell.slice(open.length, -"</w:tc>".length);
  const tcPr = /^\s*(<w:tcPr>[\s\S]*?<\/w:tcPr>)/.exec(content)?.[1].replace(/<w:vMerge\b[^>]*\/>/g, "") ?? "";
  const paragraph = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/.exec(content)?.[1] ?? "";
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? "";
  // The font is the first run's; an empty cell has only its paragraph mark's.
  let rPr = /<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(paragraph)?.[1] ?? /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(pPr)?.[0] ?? "";
  const runText = (line: string) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
  const paragraphPr = look.centre ? centred(pPr) : pPr;
  const run = (text: string, first: boolean) => (text ? `<w:r>${styledRPr(rPr, { bold: look.bold, underline: look.underline && first })}${text}</w:r>` : "");
  if (look.paragraphs && lines.length) return `${open}${tcPr}${lines.map((line, i) => `<w:p>${paragraphPr}${run(runText(line), i === 0)}</w:p>`).join("")}</w:tc>`;
  return `${open}${tcPr}<w:p>${paragraphPr}${run(lines.map(runText).join("<w:br/>"), true)}</w:p></w:tc>`;
}

// `filled` (the first of `cells`) stretched over all of `cells`: one grid span,
// the cells' widths added up.
function spanCells(filled: string, cells: string[]): string {
  const width = cells.reduce((sum, cell) => sum + Number(/<w:tcW\b[^>]*\bw:w="(\d+)"/.exec(cell)?.[1] ?? 0), 0);
  const span = `<w:gridSpan w:val="${cells.length}"/>`;
  const sized = width ? filled.replace(/(<w:tcW\b[^>]*\bw:w=")\d+(")/, `$1${width}$2`) : filled;
  if (/<w:tcW\b[^>]*\/>/.test(sized)) return sized.replace(/(<w:tcW\b[^>]*\/>)/, `$1${span}`);
  return sized.includes("<w:tcPr>") ? sized.replace("<w:tcPr>", `<w:tcPr>${span}`) : sized.replace(/^(<w:tc\b[^>]*>)/, `$1<w:tcPr>${span}</w:tcPr>`);
}

function fillRow(pattern: string, row: Row): string {
  const cells = childElements(pattern, ...inside(pattern, [0, pattern.length], "tr"), "tc");
  const [itemCell, ...rest] = cells.map((span) => pattern.slice(...span));
  // A title row, as in the real SOC: one cell across the whole table.
  if (row.style === "title") {
    const all = [itemCell, ...rest];
    return pattern.slice(0, cells[0][0]) + spanCells(fillCell(itemCell, row.lines, { bold: true, underline: true, centre: true, paragraphs: true }), all) + pattern.slice(cells[cells.length - 1][1]);
  }
  const look: CellLook = { underline: row.style === "underlined" };
  // A heading row, as in the real SOC: the item cell and one cell across the rest.
  const filled = row.heading && rest.length > 1 ? [fillCell(itemCell, [row.item]), spanCells(fillCell(rest[0], row.lines, look), rest)] : [itemCell, ...rest].map((cell, index) => fillCell(cell, [row.item ? [row.item] : [], row.lines][index] ?? []));
  return pattern.slice(0, cells[0][0]) + filled.join("") + pattern.slice(cells[cells.length - 1][1]);
}

// A customer's page header often holds the column titles as a table of its own
// (the SOC table has no header row). Word 2013+ puts a table's left edge at its
// tblInd, so a body table indented differently from the header table (same
// column grid) has its lines off the titles' by the difference; take the
// header table's indent.
function alignWithHeader(xml: string, tableStart: number, entries: ZipEntry[]): string {
  const part = (name: string) => entries.find((entry) => entry.name === name)?.data.toString("utf8") ?? "";
  if (Number(/w:name="compatibilityMode"[^>]*w:val="(\d+)"/.exec(part("word/settings.xml"))?.[1] ?? 0) < 15) return xml;
  const grid = (table: string) => /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/.exec(table)?.[0].replace(/\s+/g, "");
  const body = grid(xml.slice(tableStart));
  const indent = entries
    .filter((entry) => /^word\/header\d*\.xml$/.test(entry.name))
    .map((entry) => entry.data.toString("utf8"))
    .flatMap((header) => header.split("<w:tbl>").slice(1))
    .find((table) => grid(table) === body && /<w:tblInd /.test(table))
    ?.match(/<w:tblInd w:w="(-?\d+)"/)?.[1];
  if (!body || indent === undefined) return xml;
  return xml.slice(0, tableStart) + xml.slice(tableStart).replace(/(<w:tblInd w:w=")-?\d+(")/, `$1${indent}$2`);
}

// ------------------------------------------------------------------- build

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// The SOC check must read the draft as built: the same items and item
// numbers in order, each in the major item the item numbers give.
function assertReadsBack(draft: Uint8Array, rows: Row[]): void {
  // A title row is one cell across the table: the check reads its text as the item cell.
  const built = rows.map((row) => (row.style === "title" ? [collapse(row.lines.join(" ")), ""] : [row.item, collapse(row.lines.join(" "))]));
  let read;
  try {
    read = readSocTable(draft).rows;
  } catch {
    throw new Error(NOT_READABLE_BACK);
  }
  const before = read.slice(0, read.length - built.length);
  const after = read.slice(before.length);
  const expected = majorItemsOfRows([...before.map((row) => [row.item, row.tor]), ...built]).rowKeys.slice(before.length);
  const same = after.length === built.length && after.every((row, i) => row.item === built[i][0] && row.tor === built[i][1] && row.majorItem === expected[i]);
  if (!same) throw new Error(NOT_READABLE_BACK);
}

// Fills the first SOC table of `template` with one row per numbered item of
// the TOR pages in `ranges` (1-based, `pages[0]` is TOR page 1). The rest of
// the template is copied unchanged. Throws, with a message for the user, for
// a template that can't be used, a bad range or pages with no items.
export function buildSocDraft(template: Uint8Array, pages: TorPage[], ranges: readonly PageRange[]): SocDraft {
  const { entries, xml } = readTemplate(template);
  const table = findTemplateTable(xml);
  const { rows, warnings } = splitItems(pages, ranges);
  const filled = alignWithHeader(xml.slice(0, table.keepEnd) + rows.map((row) => fillRow(table.pattern, row)).join("") + xml.slice(table.tableEnd), table.tableStart, entries);
  const bytes = writeZip(entries.map((entry) => (entry.name === WORD_DOCUMENT ? { ...entry, data: Buffer.from(filled, "utf8") } : entry)));
  assertReadsBack(bytes, rows);
  return { bytes, warnings, rowCount: rows.length };
}
