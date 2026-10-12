// The one reader of a SOC file on the web: SOC file in; major items, row
// texts and upload warnings out. Upload, major-item splitting and the row
// texts of the review page and the results Excel (stored at import) get the
// SOC table from here and don't learn what kind of file it is.
//
// Reads the .docx or .xlsx directly (zip + XML parts), so the web server
// needs no Python or extra dependency. An Excel SOC's rows come from
// lib/soc-table-excel.ts.
import { majorItemsOfRows, normalItem, sameItem, type SocMajorItemSpec } from "@/lib/soc-major-items";
import { DOCX_MIME, magicIsDocx, NOT_A_SOC_FILE, SOC_FILE_IS_PDF, socFileNameProblem, toArabicDigits as toArabic, XLSX_MIME } from "@/lib/soc-shared";
import { isExcelSocPart, readExcelSoc } from "@/lib/soc-table-excel";
import { decodeXml } from "@/lib/xml";
import { readZip, type ZipEntry } from "@/lib/zip";

export type SocRowText = {
  tor: string; // the TOR text
  proposal: string | null; // the bidder's text
  image?: true; // the TOR cell is an image (an Image Row); never set yet
};

export type SocTable = {
  file: { extension: string; mimeType: string }; // how to store the SOC file
  majorItems: SocMajorItemSpec[];
  // A SOC row's texts, for the review page. A results.json `row` is the
  // 1-based row of the SOC table (Word: the table's row, as the skill's
  // inspect_word_table.py counts; Excel: see lib/soc-table-excel.ts); it is
  // trusted only when that row has the same item number, otherwise the one row
  // with that item, if the number is unique in the SOC. Null otherwise.
  rowText: (row: number, item: string) => SocRowText | null;
  // What the reviewer is told at upload and on the job page: sheets left
  // out, pictures not read. The check can still be requested.
  warnings: string[];
};

const UNREADABLE = "ไม่สามารถอ่านไฟล์ SOC ได้ กรุณาตรวจว่าเป็นไฟล์ Word (.docx) หรือ Excel (.xlsx) ที่ถูกต้อง";
// A .docx or .xlsx with a password is stored in the old Office container too.
const OLD_OR_LOCKED = "ไฟล์ SOC เป็นรุ่นเก่าหรือใส่รหัสผ่านไว้ กรุณา Save As เป็น .docx หรือ .xlsx แบบไม่ใส่รหัสผ่าน แล้วอัปโหลดใหม่";
const OLD_OFFICE_FILE = [0xd0, 0xcf, 0x11, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((byte, i) => bytes[i] === byte);

// Upload validation: throws, with a message for the reviewer, when the file
// isn't a kind of SOC file this reader takes. A file's content counts as
// well as its name: an old .doc renamed .docx is still refused as old.
export function assertSocFile(soc: { name: string; bytes: Uint8Array }): void {
  const byName = socFileNameProblem(soc.name);
  if (byName) throw new Error(byName);
  if (startsWith(soc.bytes, OLD_OFFICE_FILE)) throw new Error(OLD_OR_LOCKED);
  if (startsWith(soc.bytes, PDF)) throw new Error(SOC_FILE_IS_PDF);
  if (!magicIsDocx(soc.bytes)) throw new Error(NOT_A_SOC_FILE);
}

// Reads by content, whatever the file is called (a stored SOC is read again
// for the review page). Throws, with a message for the reviewer, when the
// file can't be read or holds no SOC table.
export function readSocTable(soc: Uint8Array): SocTable {
  let parts: ZipEntry[];
  try {
    parts = readZip(soc, { only: (name) => name === WORD_DOCUMENT || isExcelSocPart(name) });
  } catch {
    throw new Error(UNREADABLE);
  }
  const word = parts.find((part) => part.name === WORD_DOCUMENT);
  if (word) return socTable({ extension: ".docx", mimeType: DOCX_MIME }, readWordSocTables(word.data.toString("utf8")), []);
  if (!parts.some((part) => part.name === "xl/workbook.xml")) throw new Error(UNREADABLE);
  const excel = readExcelSoc(parts);
  const quoted = excel.skippedSheets.map((name) => `"${name}"`).join(", ");
  return socTable({ extension: ".xlsx", mimeType: XLSX_MIME }, [excel.rows], [
    ...(quoted ? [`ไม่ได้รวมชีต ${quoted} เพราะไม่พบหัวตาราง SOC (ลำดับ, ข้อกำหนด TOR, ข้อเสนอ) ชีตนี้จะไม่ถูกตรวจ`] : []),
    ...(excel.imageCount ? [`มีรูป ${excel.imageCount} รูปในไฟล์ Excel ที่ยังไม่อ่าน ระบบตรวจเฉพาะข้อความในเซลล์ กรุณาดูรูปเหล่านี้เอง`] : []),
  ]);
}

const WORD_DOCUMENT = "word/document.xml";

// `tables`: the SOC's tables as rows of [item number, TOR text, proposal text, …].
function socTable(file: SocTable["file"], tables: string[][][], warnings: string[]): SocTable {
  return {
    file,
    majorItems: majorItemsOfRows(tables.flat()),
    rowText: (row, item) => {
      const onlyTable = tables.filter((rows) => rows[row - 1]).length === 1;
      const byRow = tables.map((rows) => rows[row - 1]).find((cells) => cells && rowMatches(cells[0] || "", item, onlyTable));
      const byItem = tables.flat().filter((cells) => sameItem(cells[0] || "", item));
      const cells = byRow ?? (byItem.length === 1 ? byItem[0] : undefined);
      return cells ? { tor: cells[1] ?? "", proposal: cells[2] ?? null } : null;
    },
    warnings,
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
function readWordSocTables(documentXml: string): string[][][] {
  return readTables(documentXml)
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
