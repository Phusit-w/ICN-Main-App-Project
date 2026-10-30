// The rows of an Excel SOC, for the SOC table reader (lib/soc-table.ts).
// Reads the .xlsx parts directly (zip + xl/*.xml), cell text only.
//
// The skill's reader must number rows the same way (soc-image-rows ticket 04):
// - Sheets in workbook order. A hidden sheet is ignored. A visible sheet is
//   part of the SOC when a header row is found in it.
// - The header row is the first row with a cell that names the item column
//   (ลำดับ, ข้อ, Item, No. …) from which the TOR and proposal columns can be
//   named too. A row under it is one more header row (stacked names) when it
//   is empty, or has nothing in the item column and all its text sits under
//   cells of the header merged across columns ("ข้อเสนอ" over the proposal
//   and tick columns). A column's name is every header row's text in it, a
//   merged cell counting in each column and row it covers.
// - The reference column (อ้างอิง, เลขหน้า, ชื่อไฟล์, Reference …), the remarks
//   column (หมายเหตุ, Remark; some SOCs write references there) and the tick
//   columns (ตรงข้อกำหนด, ดีกว่าข้อกำหนด) are each optional.
// - Every row under the header rows with text in any of those columns or in
//   the item, TOR or proposal column is a SOC row. SOC rows are numbered
//   from 1, on across the sheets.
import { decodeXml } from "@/lib/xml";
import type { ZipEntry } from "@/lib/zip";

export type ExcelSoc = {
  rows: { cells: string[]; remark: string; reference: string; referenceAt?: ExcelCellAt }[]; // per SOC row: item number, TOR text, proposal text; the remarks column's text; the reference column's text ("" with no such column)
  sheets: { name: string; rowCount: number }[]; // the sheets the rows come from, in order
  skippedSheets: string[]; // visible sheets with text but no header row
  imageCount: number; // floating pictures, which are not read
};

// The parts of a workbook this reader opens (not styles of charts, pivot caches …).
export const isExcelSocPart = (name: string) => /^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml|drawings\/[^/]+\.xml)$/.test(name);

const NO_SOC_TABLE = "ไม่พบตาราง SOC ในไฟล์ Excel: ต้องมีแถวหัวตารางที่มีคอลัมน์ ลำดับ, ข้อกำหนด TOR และ ข้อเสนอ";

export const ITEM_NAME = /^(?:ลำดับ(?:\s*ที่)?|ข้อ(?:\s*ที่)?|หัวข้อ|รายการ(?:\s*ที่)?|item(?:\s*no\.?)?|no\.?|clause|#)$/i;
const COMPLY_NAME = /ตรง(?:ตาม)?(?:ข้อ)?กำหนด|\bcomply\b|\bcompliant\b/i;
const BETTER_NAME = /ดีกว่า|\bbetter\b|\bexceeds?\b/i;
export const REFERENCE_NAME = /อ้างอิง|เลขหน้า|ชื่อไฟล์|reference|\bpage\b|\bdocument\b/i;
export const REMARK_NAME = /หมายเหตุ|remark|(?<![a-z])notes?(?![a-z])/i;
export const TOR_NAME = /(?<![a-z])TOR(?![a-z])|กำหนด|requirement/i;
const PROPOSAL_NAME = /เสนอ|propos|offer|bidder|vendor/i;
const SPECIFICATION_NAME = /คุณสมบัติ|คุณลักษณะ|รายละเอียด|specification|description/i; // a TOR column not called TOR
const HEADER_SEARCH_ROWS = 200;
const MAX_STACKED_HEADER_ROWS = 6;

type Merge = { top: number; left: number; bottom: number; right: number };
// A sheet's cells, or a PDF SOC page's table (lib/soc-pdf-soc.ts). Rows and
// cells may have holes; a merged cell's text is at its top left.
export type SocGrid = { rows: string[][]; merges: Merge[] };
type Sheet = SocGrid & { name: string; hidden: boolean; part: string };
// Where a SOC row's reference cell is in the workbook: the sheet part, the 0-based row and column.
export type ExcelCellAt = { part: string; row: number; column: number };
export type SocColumns = { item: number; tor: number; proposal: number; reference: number; remark: number; comply: number; better: number }; // -1: no such column

// `parts`: the workbook's entries that isExcelSocPart names. Throws, with a
// message for the reviewer, when no sheet holds a SOC table.
export function readExcelSoc(parts: ZipEntry[]): ExcelSoc {
  // Tags are read without their namespace prefix (<x:row> as <row>).
  const text = (name: string) => parts.find((part) => part.name === name)?.data.toString("utf8").replace(/<(\/?)[A-Za-z]\w*:(?=[A-Za-z])/g, "<$1");
  const shared = elements(text("xl/sharedStrings.xml") ?? "", "si").map((si) => richText(si.body));
  const decimals = numberDecimals(text("xl/styles.xml") ?? "");
  const rows: ExcelSoc["rows"] = [];
  const sheets: ExcelSoc["sheets"] = [];
  const skippedSheets: string[] = [];
  for (const sheet of readSheets(text, shared, decimals)) {
    if (sheet.hidden || !sheet.rows.some((cells) => cells?.some(Boolean))) continue;
    const table = socRowsOfSheet(sheet);
    if (!table) { skippedSheets.push(sheet.name); continue; }
    rows.push(...table);
    sheets.push({ name: sheet.name, rowCount: table.length });
  }
  if (!rows.length) throw new Error(NO_SOC_TABLE);
  const imageCount = parts.filter((part) => part.name.startsWith("xl/drawings/")).reduce((count, part) => count + elements(text(part.name) ?? "", "pic").length, 0);
  return { rows, sheets, skippedSheets, imageCount };
}

function socRowsOfSheet(sheet: Sheet): ExcelSoc["rows"] | null {
  const header = findSocHeader(sheet);
  if (!header) return null;
  const { columns, last } = header;
  const own = (row: number, column: number) => sheet.rows[row]?.[column] ?? "";
  const tracked = [columns.item, columns.tor, columns.proposal, columns.reference, columns.remark, columns.comply, columns.better].filter((column) => column >= 0);
  const rows: ExcelSoc["rows"] = [];
  for (let row = last + 1; row < sheet.rows.length; row++) {
    if (tracked.some((column) => own(row, column))) rows.push({ cells: [own(row, columns.item), own(row, columns.tor), own(row, columns.proposal)], remark: own(row, columns.remark), reference: own(row, columns.reference), ...(columns.reference >= 0 ? { referenceAt: { part: sheet.part, row, column: columns.reference } } : {}) });
  }
  return rows;
}

// The SOC header of a grid, by the rules at the top of this file: which
// column is which, and the first and last header rows. Null when the grid has none.
// `nameKey` is applied to each column name before it is matched (a PDF SOC's
// header text keeps the spaces of its line breaks: "ตรง ข้อกำหนด").
// `needsItem: false` (a PDF SOC that writes its item numbers in the TOR text)
// also takes a header with no item column, named by its TOR and proposal
// columns alone; its item column is then -1.
export function findSocHeader(sheet: SocGrid, nameKey = (name: string) => name, { needsItem = true } = {}): { columns: SocColumns; first: number; last: number } | null {
  const own = (row: number, column: number) => sheet.rows[row]?.[column] ?? "";
  const mergeAt = (row: number, column: number) => sheet.merges.find((m) => row >= m.top && row <= m.bottom && column >= m.left && column <= m.right);
  // A cell's text as the reader of the sheet sees it: a merged cell shows its text over every cell it covers.
  const shown = (row: number, column: number) => {
    const merge = mergeAt(row, column);
    return merge ? own(merge.top, merge.left) : own(row, column);
  };
  let width = 0;
  for (const cells of sheet.rows) width = Math.max(width, cells?.length ?? 0);
  for (const merge of sheet.merges) width = Math.max(width, merge.right + 1);
  const allColumns = Array.from({ length: width }, (_, column) => column);
  const columnNames = (first: number, last: number) =>
    allColumns.map((column) => [...new Set(Array.from({ length: last - first + 1 }, (_, i) => shown(first + i, column)).filter(Boolean))].join(" "));
  const underGroupName = (first: number, row: number, column: number) => {
    for (let above = first; above < row; above++) {
      const merge = mergeAt(above, column);
      if (merge && merge.right > merge.left && own(merge.top, merge.left)) return true;
    }
    return false;
  };
  for (let first = 0; first < Math.min(sheet.rows.length, HEADER_SEARCH_ROWS); first++) {
    const item = allColumns.findIndex((column) => ITEM_NAME.test(nameKey(own(first, column))));
    if (item < 0 && needsItem) continue;
    let last = first;
    while (last - first + 1 < MAX_STACKED_HEADER_ROWS && last + 1 < sheet.rows.length) {
      const row = last + 1;
      if ((item >= 0 && own(row, item)) || !allColumns.every((column) => !own(row, column) || underGroupName(first, row, column))) break;
      last = row;
    }
    const columns = namedColumns(columnNames(first, last).map(nameKey), item);
    if (columns.tor < 0 || columns.proposal < 0) continue;
    // Without an item column, a title merged across the table ("ตารางเปรียบเทียบข้อกำหนด
    // กับข้อเสนอ") would name the TOR and proposal columns at once: it isn't the header.
    if (item < 0 && shown(first, columns.tor) === shown(first, columns.proposal)) continue;
    return { columns, first, last };
  }
  return null;
}

// Which column is which, from the columns' names. The tick, reference and
// remarks columns are named first: "ตรงข้อกำหนด" must not be taken for the TOR.
function namedColumns(names: string[], item: number): SocColumns {
  const taken = new Set([item]);
  const take = (pattern: RegExp) => {
    const column = names.findIndex((name, index) => !taken.has(index) && pattern.test(name));
    if (column >= 0) taken.add(column);
    return column;
  };
  const comply = take(COMPLY_NAME);
  const better = take(BETTER_NAME);
  const reference = take(REFERENCE_NAME);
  const remark = take(REMARK_NAME);
  const named = take(TOR_NAME);
  const proposal = take(PROPOSAL_NAME);
  const tor = named >= 0 ? named : take(SPECIFICATION_NAME);
  return { item, tor, proposal, reference, remark, comply, better };
}

function readSheets(text: (name: string) => string | undefined, shared: string[], decimals: (number | null)[]): Sheet[] {
  const targets = new Map<string, string>();
  for (const { attributes } of elements(text("xl/_rels/workbook.xml.rels") ?? "", "Relationship")) {
    const target = attribute(attributes, "Target");
    if (/\/worksheet$/.test(attribute(attributes, "Type"))) targets.set(attribute(attributes, "Id"), target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sheets: Sheet[] = [];
  for (const { attributes } of elements(text("xl/workbook.xml") ?? "", "sheet")) {
    const part = targets.get(attribute(attributes, "r:id")) ?? "";
    const xml = text(part);
    if (xml === undefined) continue; // a chart sheet
    sheets.push({ name: decodeXml(attribute(attributes, "name")), hidden: /hidden/i.test(attribute(attributes, "state")), part, rows: sheetRows(xml, shared, decimals), merges: sheetMerges(xml) });
  }
  return sheets;
}

function sheetRows(xml: string, shared: string[], decimals: (number | null)[]): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rowElement of elements(xml, "row")) {
    const rowNumber = Number(attribute(rowElement.attributes, "r"));
    const row = rowNumber ? rowNumber - 1 : nextRow;
    nextRow = row + 1;
    const cells: string[] = [];
    let nextColumn = 0;
    for (const cell of elements(rowElement.body, "c")) {
      const letters = /^[A-Z]+/.exec(attribute(cell.attributes, "r"))?.[0];
      const column = letters ? columnIndex(letters) : nextColumn;
      nextColumn = column + 1;
      const value = cellText(attribute(cell.attributes, "t"), cell.body, shared, decimals[Number(attribute(cell.attributes, "s") || -1)] ?? null);
      if (value) cells[column] = value;
    }
    rows[row] = cells;
  }
  return rows;
}

function sheetMerges(xml: string): Merge[] {
  return elements(xml, "mergeCell").flatMap(({ attributes }) => {
    const range = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(attribute(attributes, "ref"));
    return range ? [{ top: Number(range[2]) - 1, left: columnIndex(range[1]), bottom: Number(range[4]) - 1, right: columnIndex(range[3]) }] : [];
  });
}

// Per cell style, the decimals its number format always shows ("0.00" → 2),
// or null. So an item number typed as the number 1.10 reads "1.10", as the
// sheet shows it; other formats are not applied.
function numberDecimals(stylesXml: string): (number | null)[] {
  const fixed = (code: string) => (/^0(?:\.(0+))?$/.exec(code)?.[1]?.length ?? (code === "0" ? 0 : null));
  const custom = new Map(elements(stylesXml, "numFmt").map(({ attributes }) => [attribute(attributes, "numFmtId"), fixed(decodeXml(attribute(attributes, "formatCode")))]));
  const builtIn: Record<string, number> = { "1": 0, "2": 2 };
  const cellFormats = elements(stylesXml, "cellXfs")[0]?.body ?? "";
  return elements(cellFormats, "xf").map(({ attributes }) => {
    const id = attribute(attributes, "numFmtId");
    return custom.get(id) ?? builtIn[id] ?? null;
  });
}

// A cell's text, whitespace collapsed. A number is written as Excel shows a
// General cell (1.1, not 1.1000000000000001), or with its format's decimals.
function cellText(type: string, body: string, shared: string[], decimals: number | null): string {
  const value = elements(body, "v")[0]?.body ?? "";
  let text: string;
  if (type === "s") text = shared[Number(value)] ?? "";
  else if (type === "inlineStr") text = richText(body);
  else if (type === "str") text = decodeXml(value);
  else if (type === "b") text = value === "1" ? "TRUE" : "FALSE";
  else if (type === "e" || !value || !Number.isFinite(Number(value))) text = "";
  else text = decimals === null ? String(Number(value)) : Number(value).toFixed(decimals);
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, code: string) => String.fromCharCode(parseInt(code, 16))).replace(/\s+/g, " ").trim();
}

// The text of a string item: its runs joined, phonetic guides left out.
function richText(xml: string): string {
  return elements(xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ""), "t").map((t) => decodeXml(t.body)).join("");
}

// Every <tag …>…</tag> and <tag …/> of `xml`, in order, not nested in
// another <tag>. One pass over the text: a tag that is never closed ends the
// list instead of being searched for again from every later tag.
function elements(xml: string, tag: string): { attributes: string; body: string }[] {
  const found: { attributes: string; body: string }[] = [];
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let from = 0;
  for (;;) {
    const start = xml.indexOf(open, from);
    if (start < 0) break;
    const after = xml[start + open.length];
    if (after !== ">" && after !== "/" && after !== " " && after !== "\n" && after !== "\t" && after !== "\r") { // <sheetData> is not a <sheet>
      from = start + open.length;
      continue;
    }
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd < 0) break;
    if (xml[tagEnd - 1] === "/") {
      found.push({ attributes: xml.slice(start + open.length, tagEnd - 1), body: "" });
      from = tagEnd + 1;
      continue;
    }
    const end = xml.indexOf(close, tagEnd);
    if (end < 0) break;
    found.push({ attributes: xml.slice(start + open.length, tagEnd), body: xml.slice(tagEnd + 1, end) });
    from = end + close.length;
  }
  return found;
}

const attribute = (attributes: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1] ?? "";

// "A" → 0, "AA" → 26.
const columnIndex = (letters: string) => [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
