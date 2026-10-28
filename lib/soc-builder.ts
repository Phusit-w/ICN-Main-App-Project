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
const NO_TEMPLATE_TABLE = "ไม่พบตาราง SOC ในเทมเพลต: ต้องมีแถวหัวตารางที่คอลัมน์ 1 ชื่อ ลำดับ (หรือ ข้อ) และคอลัมน์ 2 ชื่อ ข้อกำหนด TOR";
const NO_TEMPLATE_ROW = "ตาราง SOC ในเทมเพลตไม่มีแถวใต้หัวตาราง กรุณาเพิ่มแถวว่าง 1 แถวเพื่อใช้เป็นแบบของทุกข้อ";
const NARROW_TEMPLATE_ROW = "แถวสุดท้ายของตาราง SOC ในเทมเพลตมีน้อยกว่า 2 คอลัมน์ (ต้องมีคอลัมน์เลขข้อและคอลัมน์ TOR)";
const NO_ITEMS = "ไม่พบข้อที่มีเลขกำกับ (เช่น ๔.๓.๑) ในหน้า TOR ที่เลือก กรุณาตรวจช่วงหน้า";
const NOT_READABLE_BACK = "สร้าง SOC ไม่สำเร็จ: ระบบตรวจ SOC อ่านแถวของไฟล์ที่สร้างไม่ตรงกับที่สร้าง (เทมเพลตนี้อาจใช้ไม่ได้) กรุณาติดต่อผู้ดูแลระบบ";

// ------------------------------------------------------------ the splitter

// A SOC row to write: the item number as the TOR writes it (empty for a ผนวก
// heading), its text lines, the first TOR page, and whether it is a heading.
type Row = { item: string; lines: string[]; heading: boolean; page: number; picture: boolean };

// "๔.๓.๑ …", "๕. …", "## ๕. …"; the text after the number may be empty.
const ITEM_LINE = /^[#*\s]*([0-9๐-๙]+(?:\.[0-9๐-๙]+)*)(\.?)(?:\s+(.*))?$/;
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
  const looseText = new Set<number>(); // pages with text before the first item
  const loosePictures: number[] = [];
  let current = null as Row | null;
  // The numbering state restarts under every ผนวก heading. `major` and
  // `list` follow lib/soc-major-items.ts: "N." starts major item N only when
  // N is past the current one and doesn't run on a list (the last list row
  // was not N−1); otherwise it is a list row inside the current item.
  let last: number[] | null = null;
  let major: number | null = null;
  let list: number | null = null;

  const accepts = (numbers: number[]): boolean => {
    if (numbers.length === 1) {
      const [n] = numbers;
      if (major === null || (n > major && list !== n - 1)) {
        major = n;
        list = null;
        last = numbers;
        return true;
      }
      list = n;
      return false;
    }
    // A dotted number is an item when it comes after the last one, in the
    // current major item or a later one ("2.5 เมตร" inside ข้อ ๔ is not).
    if (major !== null && (numbers[0] < major || (numbers[0] === major && last && compareNumbers(numbers, last) <= 0))) return false;
    if (major === null || numbers[0] > major) {
      major = numbers[0];
      list = null;
    }
    last = numbers;
    return true;
  };

  for (const page of pageNumbers(ranges)) {
    const read = pages[page - 1];
    if (!read || (!read.picture && !read.text.trim())) {
      unread.push(page);
      continue;
    }
    const before = current;
    for (const raw of thaiText(read.text).split("\n")) {
      const line = raw.replace(XML_UNSAFE, "").trim();
      if (!line) continue;
      if (ANNEX_LINE.test(line)) {
        current = { item: "", lines: [line], heading: true, page, picture: read.picture };
        rows.push(current);
        last = major = list = null;
        continue;
      }
      const match = ITEM_LINE.exec(line);
      const numbers = match && (match[1].includes(".") || match[2]) ? match[1].split(".").map((n) => Number(toArabicDigits(n))) : null;
      if (match && numbers && accepts(numbers)) {
        current = { item: match[1] + match[2], lines: match[3] ? [match[3]] : [], heading: numbers.length === 1, page, picture: read.picture };
        rows.push(current);
      } else if (current) {
        current.lines.push(line);
      } else {
        looseText.add(page);
      }
    }
    // A picture page that starts no item continues the item before it.
    if (read.picture && current === before) {
      if (current) current.picture = true;
      else loosePictures.push(page);
    }
  }

  if (!rows.length) throw new Error(NO_ITEMS);
  const named = (pages: number[]) => pages.map((page) => `หน้า ${page}`).join(", ");
  const warnings = [
    ...(looseText.size ? [`ข้อความก่อนข้อแรก (${named([...looseText])}) แยกเป็นข้อไม่ได้ จึงไม่ได้ใส่ใน SOC กรุณาตรวจเอง`] : []),
    ...(loosePictures.length ? [`${named(loosePictures)} ของ TOR เป็นรูปภาพก่อนข้อแรก ไม่ได้ใส่ใน SOC กรุณาตรวจเอง`] : []),
    ...rows.filter((row) => row.picture).map((row) => `${row.item ? `ข้อ ${row.item}` : row.lines[0]} (หน้า ${row.page} ของ TOR) มีรูปภาพ กรุณาวางรูปใน Word เอง`),
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

type TemplateTable = { headerEnd: number; tableEnd: number; pattern: string };

// The first table with a header row (ลำดับ | ข้อกำหนด TOR …), and its last
// row as the pattern for every row.
function findTemplateTable(xml: string): TemplateTable {
  for (const table of childElements(xml, 0, xml.length, "tbl")) {
    const [from, to] = inside(xml, table, "tbl");
    const rows = childElements(xml, from, to, "tr");
    const header = rows.findIndex((row) => {
      const [a, b] = childElements(xml, ...inside(xml, row, "tr"), "tc");
      return b && ITEM_NAME.test(cellText(xml.slice(...a))) && TOR_NAME.test(cellText(xml.slice(...b)));
    });
    if (header < 0) continue;
    if (header === rows.length - 1) throw new Error(NO_TEMPLATE_ROW);
    const pattern = xml.slice(...rows[rows.length - 1]);
    if (childElements(pattern, ...inside(pattern, [0, pattern.length], "tr"), "tc").length < 2) throw new Error(NARROW_TEMPLATE_ROW);
    return { headerEnd: rows[header][1], tableEnd: rows[rows.length - 1][1], pattern };
  }
  throw new Error(NO_TEMPLATE_TABLE);
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
// read back by the SOC check: no table whose first row names the item number
// and TOR columns, or no row under it to use as the pattern.
export function assertSocTemplate(template: Uint8Array): void {
  findTemplateTable(readTemplate(template).xml);
}

// ----------------------------------------------------------------- filling

// Bold goes where the schema puts it: after rStyle and rFonts, before the rest.
function withBold(rPr: string): string {
  const inner = rPr.replace(/^<w:rPr>|<\/w:rPr>$/g, "").replace(/<w:b(?:Cs)?(?:\s[^>]*)?\/>/g, "");
  const lead = /^(?:<w:rStyle\b[^>]*\/>)?(?:<w:rFonts\b[^>]*\/>)?/.exec(inner)![0];
  return `<w:rPr>${lead}<w:b/><w:bCs/>${inner.slice(lead.length)}</w:rPr>`;
}

// An empty copy of a template cell (its properties, paragraph and font kept)
// holding `lines`, one Word line break between them.
function fillCell(cell: string, lines: string[], bold: boolean): string {
  const open = /^<w:tc\b[^>]*>/.exec(cell)![0];
  const content = cell.slice(open.length, -"</w:tc>".length);
  const tcPr = /^\s*(<w:tcPr>[\s\S]*?<\/w:tcPr>)/.exec(content)?.[1].replace(/<w:vMerge\b[^>]*\/>/g, "") ?? "";
  const paragraph = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/.exec(content)?.[1] ?? "";
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? "";
  // The font is the first run's; an empty cell has only its paragraph mark's.
  let rPr = /<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(paragraph)?.[1] ?? /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(pPr)?.[0] ?? "";
  if (bold) rPr = withBold(rPr);
  const text = lines.map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join("<w:br/>");
  return `${open}${tcPr}<w:p>${pPr}${text ? `<w:r>${rPr}${text}</w:r>` : ""}</w:p></w:tc>`;
}

function fillRow(pattern: string, row: Row): string {
  const cells = childElements(pattern, ...inside(pattern, [0, pattern.length], "tr"), "tc");
  const texts = [row.item ? [row.item] : [], row.lines];
  const filled = cells.map((span, index) => fillCell(pattern.slice(...span), texts[index] ?? [], row.heading));
  return pattern.slice(0, cells[0][0]) + filled.join("") + pattern.slice(cells[cells.length - 1][1]);
}

// ------------------------------------------------------------------- build

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// The SOC check must read the draft as built: the same items and item
// numbers in order, each in the major item the item numbers give.
function assertReadsBack(draft: Uint8Array, rows: Row[]): void {
  const built = rows.map((row) => [row.item, collapse(row.lines.join(" "))]);
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
  const filled = xml.slice(0, table.headerEnd) + rows.map((row) => fillRow(table.pattern, row)).join("") + xml.slice(table.tableEnd);
  const bytes = writeZip(entries.map((entry) => (entry.name === WORD_DOCUMENT ? { ...entry, data: Buffer.from(filled, "utf8") } : entry)));
  assertReadsBack(bytes, rows);
  return { bytes, warnings, rowCount: rows.length };
}
