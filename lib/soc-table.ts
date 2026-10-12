// The one reader of a SOC file on the web: SOC file in; major items, row
// texts and upload warnings out. Upload, major-item splitting and the row
// texts of the review page and the results Excel (stored at import) get the
// SOC table from here and don't learn what kind of file it is.
//
// Reads the .docx or .xlsx directly (zip + XML parts), so the web server
// needs no Python or extra dependency. An Excel SOC's rows come from
// lib/soc-table-excel.ts.
import path from "node:path";
import { majorItemsOfRows, normalItem, sameItem, type SocMajorItemSpec } from "@/lib/soc-major-items";
import { DOCX_MIME, magicIsDocx, NOT_A_SOC_FILE, SOC_FILE_IS_PDF, socFileNameProblem, toArabicDigits as toArabic, XLSX_MIME } from "@/lib/soc-shared";
import { isExcelSocPart, readExcelSoc } from "@/lib/soc-table-excel";
import { decodeXml } from "@/lib/xml";
import { readZip, type ZipEntry } from "@/lib/zip";

export type SocRowText = {
  tor: string; // the TOR text
  proposal: string | null; // the bidder's text
  image?: true; // an Image Row: the TOR cell is an image and has no text
};

// An Image Row's image as the SOC file holds it. `mimeType` is null for a
// kind a browser can't show (.emf, .wmf, .tiff …).
export type SocRowImage = { name: string; data: Uint8Array; mimeType: string | null };

export type SocTable = {
  file: { extension: string; mimeType: string }; // how to store the SOC file
  majorItems: SocMajorItemSpec[];
  // A SOC row's texts, for the review page. A results.json `row` is the
  // 1-based row of the SOC table (Word: the table's row, as the skill's
  // inspect_word_table.py counts; Excel: see lib/soc-table-excel.ts); it is
  // trusted only when that row has the same item number, otherwise the one row
  // with that item, if the number is unique in the SOC. Null otherwise.
  rowText: (row: number, item: string) => SocRowText | null;
  // The image of an Image Row, found like `rowText`, for the review page.
  // Null when the row isn't an Image Row or its image can't be read.
  rowImage: (row: number, item: string) => SocRowImage | null;
  // The sheet a SOC row is on, to show with the row when an Excel SOC has
  // more than one sheet. Null otherwise.
  sheetOfRow: (row: number) => string | null;
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
  if (word) return socTable({ extension: ".docx", mimeType: DOCX_MIME }, readWordSocTables(word.data.toString("utf8")), [], () => null, (id) => readWordImage(soc, id));
  if (!parts.some((part) => part.name === "xl/workbook.xml")) throw new Error(UNREADABLE);
  const excel = readExcelSoc(parts);
  const quoted = excel.skippedSheets.map((name) => `"${name}"`).join(", ");
  const sheetOfRow = (row: number) => {
    if (excel.sheets.length < 2 || row < 1) return null;
    let last = 0;
    return excel.sheets.find((sheet) => row <= (last += sheet.rowCount))?.name ?? null;
  };
  return socTable({ extension: ".xlsx", mimeType: XLSX_MIME }, [excel.rows.map((cells) => ({ cells }))], [
    ...(quoted ? [`ไม่ได้รวมชีต ${quoted} เพราะไม่พบหัวตาราง SOC (ลำดับ, ข้อกำหนด TOR, ข้อเสนอ) ชีตนี้จะไม่ถูกตรวจ`] : []),
    ...(excel.imageCount ? [`มีรูป ${excel.imageCount} รูปในไฟล์ Excel ที่ยังไม่อ่าน ระบบตรวจเฉพาะข้อความในเซลล์ กรุณาดูรูปเหล่านี้เอง`] : []),
  ], sheetOfRow, () => null);
}

const WORD_DOCUMENT = "word/document.xml";
const WORD_RELATIONSHIPS = "word/_rels/document.xml.rels";

// A SOC table row: [item number, TOR text, proposal text, …], and for an
// Image Row the id its image has in the SOC file (Word: a relationship id).
type SocRow = { cells: string[]; imageId?: string };

const hasNumber = (cell: string) => /\d/.test(toArabic(cell));

function socTable(file: SocTable["file"], tables: SocRow[][], warnings: string[], sheetOfRow: SocTable["sheetOfRow"], readImage: (imageId: string) => SocRowImage | null): SocTable {
  const itemOf = (row: SocRow) => row.cells[0] || "";
  const findRow = (rowNumber: number, itemNumber: string): SocRow | undefined => {
    const index = rowNumber - 1;
    const withRow = tables.filter((rows) => rows[index]);
    const byRow = withRow.find((rows) => rowMatches(itemOf(rows[index]), itemNumber, withRow.length === 1));
    if (byRow) return byRow[index];
    // A row with no number (an Image Row, a sub-condition) that several
    // tables have: the one whose numbered row above it is that item.
    const underItem = withRow.filter((rows) => {
      if (hasNumber(itemOf(rows[index]))) return false;
      const above = rows.slice(0, index).findLast((row) => hasNumber(itemOf(row)));
      return above !== undefined && rowMatches(itemOf(above), itemNumber, false);
    });
    if (underItem.length === 1) return underItem[0][index];
    const byItem = tables.flat().filter((row) => sameItem(itemOf(row), itemNumber));
    return byItem.length === 1 ? byItem[0] : undefined;
  };
  return {
    file,
    sheetOfRow,
    majorItems: majorItemsOfRows(tables.flat().map((row) => row.cells)),
    rowText: (rowNumber, itemNumber) => {
      const row = findRow(rowNumber, itemNumber);
      return row ? { tor: row.cells[1] ?? "", proposal: row.cells[2] ?? null, ...(row.imageId ? { image: true } : {}) } : null;
    },
    rowImage: (rowNumber, itemNumber) => {
      const imageId = findRow(rowNumber, itemNumber)?.imageId;
      return imageId ? readImage(imageId) : null;
    },
    warnings,
  };
}

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

// The image file a relationship of the Word document names. Null when the
// image isn't inside the file (a linked image) or can't be read.
function readWordImage(soc: Uint8Array, relationshipId: string): SocRowImage | null {
  try {
    const part = (name: string) => readZip(soc, { only: (entry) => entry === name })[0]?.data;
    const attribute = (tag: string, name: string) => decodeXml(new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "");
    const relationship = (part(WORD_RELATIONSHIPS)?.toString("utf8") ?? "").match(/<Relationship\b[^>]*>/g)?.find((tag) => attribute(tag, "Id") === relationshipId);
    if (!relationship || attribute(relationship, "TargetMode") === "External") return null;
    const target = attribute(relationship, "Target");
    // Relative to word/ ("media/image1.png", "../media/x.png") or from the root ("/word/media/…").
    const data = part(path.posix.join(target.startsWith("/") ? "" : "word", target).replace(/^\//, ""));
    if (!data) return null;
    const name = target.split("/").pop() ?? target;
    return { name, data: new Uint8Array(data), mimeType: IMAGE_MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? null };
  } catch {
    return null;
  }
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
function readWordSocTables(documentXml: string): SocRow[][] {
  return readTables(documentXml)
    .filter((rows) => rows.some((row) => /[0-9๐-๙]\.[0-9๐-๙]/.test((row.cells[0] || "").replace(/\s+/g, ""))));
}

// Every top-level table as rows of cells (whitespace collapsed). Tables
// nested inside a cell are skipped; their text isn't part of the cell.
// A row whose TOR cell (the second) has an image and no text is an Image
// Row: `imageId` is the relationship id of the cell's first image, as a drawing
// (a:blip) or as the VML of a .doc saved as .docx (v:imagedata).
function readTables(xml: string): SocRow[][] {
  const tables: SocRow[][] = [];
  let rows: SocRow[] = [];
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/>|<(\/?)w:(tbl|tr|tc|p)\b[^>]*?(\/?)>|<(?:a:blip|v:imagedata)\b[^>]*?\sr:(?:embed|id)="([^"]*)"/g;
  let depth = 0;
  let row: SocRow | null = null;
  let cell: string[] | null = null;
  let cellImageId: string | null = null; // the first image of the cell being read
  for (const match of xml.matchAll(token)) {
    const [, text, closing, tag, selfClosing, imageId] = match;
    if (text !== undefined) {
      if (depth === 1 && cell) cell.push(decodeXml(text));
      continue;
    }
    if (imageId !== undefined) {
      if (depth === 1 && cell) cellImageId ??= decodeXml(imageId);
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
      row = closing ? null : { cells: [] };
    } else if (tag === "tc") {
      if (closing && row && cell) {
        const cellText = cell.join("").replace(/\s+/g, " ").trim();
        if (row.cells.push(cellText) === 2 && !cellText && cellImageId) row.imageId = cellImageId;
      }
      cell = closing ? null : [];
      cellImageId = null;
    } else if (tag === "p" && closing && cell) {
      cell.push(" ");
    }
  }
  return tables;
}
