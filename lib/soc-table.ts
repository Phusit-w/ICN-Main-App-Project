// The one reader of a SOC file on the web: SOC file in; major items, row
// texts and upload warnings out. Upload, major-item splitting and the row
// texts of the review page and the results Excel (stored at import) get the
// SOC table from here and don't learn what kind of file it is.
//
// Reads the .docx directly (zip + word/document.xml), so the web server needs
// no Python or extra dependency.
import path from "node:path";
import { majorItemsOfRows, normalItem, sameItem, type SocMajorItemSpec } from "@/lib/soc-major-items";
import { DOCX_MIME, magicIsDocx, toArabicDigits as toArabic } from "@/lib/soc-shared";
import { readZip } from "@/lib/zip";

export type SocRowText = {
  tor: string; // the TOR text (second cell)
  proposal: string | null; // the bidder's text (third cell)
  image?: true; // the TOR cell is an image (an Image Row); never set yet
};

export type SocTable = {
  file: { extension: string; mimeType: string }; // how to store the SOC file
  majorItems: SocMajorItemSpec[];
  // A SOC row's texts, for the review page. A results.json `row` is the
  // 1-based row of the SOC table (the skill's inspect_word_table.py); it is
  // trusted only when that row has the same item number, otherwise the one row
  // with that item, if the number is unique in the SOC. Null otherwise.
  rowText: (row: number, item: string) => SocRowText | null;
  warnings: string[]; // what the reviewer is told at upload; none yet
};

const NOT_A_SOC_FILE = "ไฟล์ SOC ต้องเป็น DOCX ที่ถูกต้อง";
const UNREADABLE = "ไม่สามารถอ่านไฟล์ SOC ได้ กรุณาตรวจว่าเป็นไฟล์ Word (.docx) ที่ถูกต้อง";

// Upload validation: throws, with a message for the reviewer, when the file
// isn't a kind of SOC file this reader takes.
export function assertSocFile(soc: { name: string; bytes: Uint8Array }): void {
  if (path.extname(soc.name).toLowerCase() !== ".docx" || !magicIsDocx(soc.bytes)) throw new Error(NOT_A_SOC_FILE);
}

// Reads by content, whatever the file is called (a stored SOC is read again
// for the review page). Throws, with a message for the reviewer, when the
// file can't be read.
export function readSocTable(soc: Uint8Array): SocTable {
  const tables = readWordSocTables(soc);
  return {
    file: { extension: ".docx", mimeType: DOCX_MIME },
    majorItems: majorItemsOfRows(tables.flat()),
    rowText: (row, item) => {
      const onlyTable = tables.filter((rows) => rows[row - 1]).length === 1;
      const byRow = tables.map((rows) => rows[row - 1]).find((cells) => cells && rowMatches(cells[0] || "", item, onlyTable));
      const byItem = tables.flat().filter((cells) => sameItem(cells[0] || "", item));
      const cells = byRow ?? (byItem.length === 1 ? byItem[0] : undefined);
      return cells ? { tor: cells[1] ?? "", proposal: cells[2] ?? null } : null;
    },
    warnings: [],
  };
}

// A row the SOC numbers relative to its major item ("๗.๑)", "(1)") is matched by
// row number when the absolute item ends with that number ("๕.๘.๗.๑"); a row with
// no number ("-", blank) by row number alone, when only one table has that row.
const RELATIVE_NUMBER = /^\(?(\d+(?:\.\d+)*)[.)]?$/;

function rowMatches(cell: string, item: string, onlyTable: boolean): boolean {
  if (sameItem(cell, item)) return true;
  const relative = RELATIVE_NUMBER.exec(toArabic(cell.replace(/\s+/g, "")));
  if (!relative) return onlyTable && !/\d/.test(toArabic(cell));
  const own = relative[1].split(".").map(Number);
  const full = normalItem(item).split(".").map(Number);
  return full.length > own.length && own.every((part, index) => part === full[full.length - own.length + index]);
}

// Only SOC tables count: ones with at least one dotted item number ("๑.๑").
// A cover or signature table numbered 1, 2, 3 adds no major items.
function readWordSocTables(docx: Uint8Array): string[][][] {
  return readTables(readZipEntry(docx, "word/document.xml"))
    .filter((rows) => rows.some((cells) => /[0-9๐-๙]\.[0-9๐-๙]/.test((cells[0] || "").replace(/\s+/g, ""))));
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
function readZipEntry(zip: Uint8Array, name: string): string {
  let entry;
  try {
    [entry] = readZip(zip, { only: (entryName) => entryName === name });
  } catch {
    throw new Error(UNREADABLE);
  }
  if (!entry) throw new Error(UNREADABLE);
  return entry.data.toString("utf8");
}
