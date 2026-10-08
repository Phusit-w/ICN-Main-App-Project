// Major items (ข้อใหญ่) of a SOC: the top-level item numbers in the first
// column of the SOC's tables, in document order. This is a deterministic read
// of the table structure, not a compliance check (spec "Job model"); a major
// item is the unit one Local Check Run covers.
//
// Reads the .docx directly (zip + word/document.xml), so the web server needs
// no Python or extra dependency.
import { SPLIT_MAJOR_ITEM_ROWS, toArabicDigits as toArabic } from "@/lib/soc-shared";
import { readZip } from "@/lib/zip";

export type SocMajorItemSpec = {
  key: string; // the number in Arabic digits, e.g. "1" for both "๑" and "1.", or "5.5" for a sub-section of a split item
  label: string; // the number as the SOC writes it, e.g. "๑" or "๕.๕"
  title: string | null; // text of the item's own heading row, when the SOC has one
  rowCount: number; // SOC table rows the item covers, its heading row and unnumbered rows included
  groupLabel: string | null; // a sub-section of a split major item: that major item's label, e.g. "๕"
  groupTitle: string | null; // and its heading row's text
  // ไม่ต้องตรวจ, guessed on import: when a large item was split, that item is
  // the specification part, and the others (หลักการ, คุณสมบัติผู้ยื่น …) are
  // not checked against datasheets. Without a split there is no guess. The
  // user can switch any item either way on the job page.
  skipped: boolean;
};

const UNREADABLE = "ไม่สามารถอ่านไฟล์ SOC ได้ กรุณาตรวจว่าเป็นไฟล์ Word (.docx) ที่ถูกต้อง";
const MAX_TITLE = 300;

// "๑.๒.๗", "4.3.1", "1.5.1." — the same shape soc-worker's is_item_label accepts.
const ITEM_LABEL = /^[0-9๐-๙]+(?:\.[0-9๐-๙]+)*\.?$/;

// The item number's segments as written ("๕.๕.๓" → ["๕", "๕", "๓"]), or
// null when the text isn't an item number.
function itemSegments(item: string): string[] | null {
  const compact = item.replace(/\s+/g, "");
  return ITEM_LABEL.test(compact) ? compact.replace(/\.$/, "").split(".") : null;
}

const segmentKey = (segments: string[]) => segments.map((s) => String(Number(toArabic(s)))).join(".");

// The major item an item number belongs to before any split ("๑.๒.๗" →
// "1"), or null when the text isn't an item number.
export function majorItemKey(item: string): string | null {
  const segments = itemSegments(item);
  return segments ? segmentKey(segments.slice(0, 1)) : null;
}

// Whether an item number belongs to a major item record: "๕.๕.๓" belongs to
// "5" and, after a split, to "5.5". The split major item's own heading row
// ("๕") belongs to its first sub-section only (`takesGroupHeading`).
export function isItemInMajorItem(item: string, majorItem: { key: string }, { takesGroupHeading = false } = {}): boolean {
  const segments = itemSegments(item);
  if (!segments) return false;
  const path = segmentKey(segments).split(".");
  const key = majorItem.key.split(".");
  if (takesGroupHeading && path.length === 1 && path[0] === key[0]) return true;
  return key.every((segment, i) => path[i] === segment);
}

// Only SOC tables count: ones with at least one dotted item number ("๑.๑").
// A cover or signature table numbered 1, 2, 3 adds no major items.
function readSocTables(docx: Uint8Array): string[][][] {
  return readTables(readZipEntry(docx, "word/document.xml"))
    .filter((rows) => rows.some((cells) => /[0-9๐-๙]\.[0-9๐-๙]/.test((cells[0] || "").replace(/\s+/g, ""))));
}

type ItemTally = { key: string; label: string; title: string | null; rowCount: number };
// rowsBeforeSubs: its heading row and any row before its first sub-section.
type MajorItemTally = ItemTally & { rowsBeforeSubs: number; subs: Map<string, ItemTally> };

export function readSocMajorItems(docx: Uint8Array): SocMajorItemSpec[] {
  // Each row counts towards the item number above it, until the next one.
  const majors = new Map<string, MajorItemTally>();
  let major: MajorItemTally | null = null;
  let sub: ItemTally | null = null;
  for (const cells of readSocTables(docx).flat()) {
    const segments = itemSegments(cells[0] || "");
    const text = () => cells.slice(1).find((t) => t)?.slice(0, MAX_TITLE) || null;
    if (segments) {
      const key = segmentKey(segments.slice(0, 1));
      major = majors.get(key) ?? { key, label: segments[0], title: null, rowCount: 0, rowsBeforeSubs: 0, subs: new Map() };
      majors.set(key, major);
      if (segments.length === 1 && !major.title) major.title = text();
      sub = null;
      if (segments.length > 1) {
        const subKey = segmentKey(segments.slice(0, 2));
        sub = major.subs.get(subKey) ?? { key: subKey, label: segments.slice(0, 2).join("."), title: null, rowCount: 0 };
        major.subs.set(subKey, sub);
        if (segments.length === 2 && !sub.title) sub.title = text();
      }
    }
    if (!major) continue;
    major.rowCount += 1;
    if (sub) sub.rowCount += 1;
    else major.rowsBeforeSubs += 1;
  }
  // Over SPLIT_MAJOR_ITEM_ROWS: split one level, into the second-level
  // sub-sections (๕ → ๕.๑ … ๕.๑๕). A sub-section isn't split again.
  const items = [...majors.values()].flatMap(({ rowsBeforeSubs, subs, ...item }): Omit<SocMajorItemSpec, "skipped">[] => {
    if (item.rowCount <= SPLIT_MAJOR_ITEM_ROWS || subs.size < 2) return [{ ...item, groupLabel: null, groupTitle: null }];
    // The major item's own heading row (and any row before ๕.๑) joins the first sub-section.
    return [...subs.values()].map((s, i) => ({ ...s, rowCount: s.rowCount + (i === 0 ? rowsBeforeSubs : 0), groupLabel: item.label, groupTitle: item.title }));
  });
  const split = items.some((item) => item.groupLabel);
  return items.map((item) => ({ ...item, skipped: split && !item.groupLabel }));
}

const sameItem = (a: string, b: string) => {
  const normal = (item: string) => toArabic(item.replace(/\s+/g, "")).replace(/\.$/, "");
  return normal(a) === normal(b);
};

// A SOC row's TOR text (second cell) and the bidder's text (third cell), for
// the review page. A results.json `row` is the 1-based row of the SOC table
// (the skill's inspect_word_table.py); it is trusted only when that row has
// the same item number, otherwise the one row with that item, if the number
// is unique in the SOC. Returns a lookup that gives null otherwise.
// A row the SOC numbers relative to its major item ("๗.๑)", "(1)") is matched by
// row number when the absolute item ends with that number ("๕.๘.๗.๑"); a row with
// no number ("-", blank) by row number alone, when only one table has that row.
const RELATIVE_NUMBER = /^\(?(\d+(?:\.\d+)*)[.)]?$/;
const segments = (item: string) => toArabic(item.replace(/\s+/g, "")).replace(/\.$/, "").split(".");

function rowMatches(cell: string, item: string, onlyTable: boolean): boolean {
  if (sameItem(cell, item)) return true;
  const relative = RELATIVE_NUMBER.exec(toArabic(cell.replace(/\s+/g, "")));
  if (!relative) return onlyTable && !/\d/.test(toArabic(cell));
  const own = relative[1].split(".").map(Number);
  const full = segments(item).map(Number);
  return full.length > own.length && own.every((part, index) => part === full[full.length - own.length + index]);
}

export function socRowTexts(docx: Uint8Array): (row: number, item: string) => { tor: string; proposal: string | null } | null {
  const tables = readSocTables(docx);
  return (row, item) => {
    const onlyTable = tables.filter((rows) => rows[row - 1]).length === 1;
    const byRow = tables.map((rows) => rows[row - 1]).find((cells) => cells && rowMatches(cells[0] || "", item, onlyTable));
    const byItem = tables.flat().filter((cells) => sameItem(cells[0] || "", item));
    const cells = byRow ?? (byItem.length === 1 ? byItem[0] : undefined);
    return cells ? { tor: cells[1] ?? "", proposal: cells[2] ?? null } : null;
  };
}

// Every top-level table as rows of cells (whitespace collapsed). Tables
// nested inside a cell are skipped; their text isn't part of the cell.
function readTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  let rows: string[][] = [];
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/>|<(\/?)w:(tbl|tr|tc|p)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let row: string[] | null = null;
  let cell: string[] | null = null;
  for (const match of xml.matchAll(token)) {
    const [, text, closing, tag, selfClosing] = match;
    if (text !== undefined) {
      if (depth === 1 && cell) cell.push(decodeXml(text));
      continue;
    }
    if (!tag) {
      if (depth === 1 && cell) cell.push(" ");
      continue;
    }
    if (selfClosing) continue;
    if (tag === "tbl") {
      depth += closing ? -1 : 1;
      if (closing && depth === 0) { tables.push(rows); rows = []; }
    } else if (depth !== 1) {
      continue;
    } else if (tag === "tr") {
      if (closing && row) rows.push(row);
      row = closing ? null : [];
    } else if (tag === "tc") {
      if (closing && row && cell) row.push(cell.join("").replace(/\s+/g, " ").trim());
      cell = closing ? null : [];
    } else if (tag === "p" && closing && cell) {
      cell.push(" ");
    }
  }
  return tables;
}

function decodeXml(value: string): string {
  return value.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

// Reads one text file out of a .docx (or any zip archive).
export function readZipEntry(zip: Uint8Array, name: string): string {
  let entry;
  try {
    [entry] = readZip(zip, { only: (entryName) => entryName === name });
  } catch {
    throw new Error(UNREADABLE);
  }
  if (!entry) throw new Error(UNREADABLE);
  return entry.data.toString("utf8");
}
