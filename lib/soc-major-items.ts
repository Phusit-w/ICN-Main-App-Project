// Major items (ข้อใหญ่) of a SOC: the top-level item numbers in the first
// column of the SOC's tables, in document order. This is a deterministic read
// of the table structure, not a compliance check (spec "Job model"); a major
// item is the unit one Local Check Run covers.
//
// Reads the .docx directly (zip + word/document.xml), so the web server needs
// no Python or extra dependency.
import { inflateRawSync } from "node:zlib";

export type SocMajorItemSpec = {
  key: string; // the number in Arabic digits, e.g. "1" for both "๑" and "1."
  label: string; // the number as the SOC writes it, e.g. "๑"
  title: string | null; // text of the item's own heading row, when the SOC has one
};

const UNREADABLE = "ไม่สามารถอ่านไฟล์ SOC ได้ กรุณาตรวจว่าเป็นไฟล์ Word (.docx) ที่ถูกต้อง";
const MAX_TITLE = 300;

// "๑.๒.๗", "4.3.1", "1.5.1." — the same shape soc-worker's is_item_label accepts.
const ITEM_LABEL = /^[0-9๐-๙]+(?:\.[0-9๐-๙]+)*\.?$/;

function toArabic(value: string): string {
  return value.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

// The major item an item number belongs to ("๑.๒.๗" → "1"), or null when the
// text isn't an item number.
export function majorItemKey(item: string): string | null {
  const compact = item.replace(/\s+/g, "");
  if (!ITEM_LABEL.test(compact)) return null;
  return String(Number(toArabic(compact.split(".")[0])));
}

export function readSocMajorItems(docx: Uint8Array): SocMajorItemSpec[] {
  const items = new Map<string, SocMajorItemSpec>();
  // Only SOC tables count: ones with at least one dotted item number ("๑.๑").
  // A cover or signature table numbered 1, 2, 3 adds no major items.
  const tables = readTables(readZipEntry(docx, "word/document.xml"))
    .filter((rows) => rows.some((cells) => /[0-9๐-๙]\.[0-9๐-๙]/.test((cells[0] || "").replace(/\s+/g, ""))));
  for (const cells of tables.flat()) {
    const item = (cells[0] || "").replace(/\s+/g, "");
    const key = majorItemKey(item);
    if (!key) continue;
    const segments = item.replace(/\.$/, "").split(".");
    const existing = items.get(key) ?? { key, label: segments[0], title: null };
    if (segments.length === 1 && !existing.title) {
      existing.title = cells.slice(1).find((text) => text)?.slice(0, MAX_TITLE) || null;
    }
    items.set(key, existing);
  }
  return [...items.values()];
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

// Reads one file out of a zip archive (stored or deflated; no zip64, which a
// SOC under the 25 MB upload limit never needs).
export function readZipEntry(zip: Uint8Array, name: string): string {
  const buffer = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  try {
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error("no end of central directory");
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);
    for (let i = 0; i < count; i++) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("bad central directory");
      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localOffset = buffer.readUInt32LE(offset + 42);
      const entryName = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
      offset += 46 + nameLength + extraLength + commentLength;
      if (entryName !== name) continue;
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("bad local header");
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
      throw new Error(`unsupported compression ${method}`);
    }
  } catch {
    throw new Error(UNREADABLE);
  }
  throw new Error(UNREADABLE);
}
