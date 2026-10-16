// Warnings about a scanned PDF SOC's read (ADR 0010). Nobody confirms OCR text
// row by row, so the rows are checked for the signs of a misread: a gap or a
// repeat in the item numbers, an empty TOR cell, a word doubled in a cell.
// Rows are those of scanned pages only, in order; `figure` rows hold a picture
// in the TOR cell and are not "empty".
export type ScannedRow = { item?: string; tor?: string; text: string[]; page: number; figure: boolean };

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const toNumber = (digits: string) => Number([...digits].map((c) => (THAI_DIGITS.includes(c) ? THAI_DIGITS.indexOf(c) : c)).join(""));
const toThai = (n: number) => [...String(n)].map((c) => THAI_DIGITS[Number(c)]).join("");
const MAX_LISTED = 10;
const listed = (names: string[]) => names.slice(0, MAX_LISTED).join(", ") + (names.length > MAX_LISTED ? ` และอีก ${names.length - MAX_LISTED}` : "");
// A word of 3+ letters said twice in a row, with or without a space between.
const DOUBLED_WORD = /([^\s\d๐-๙|.,;:()\-]{3,})\s?\1/u;

export function scanQualityWarnings(rows: ScannedRow[]): string[] {
  const warnings: string[] = [];

  // Item numbers, siblings under one parent ("๕.๓" and "๕.๔" under "๕"): a
  // number seen twice is a repeat, a number between the first and last seen
  // and never seen is a gap.
  const siblings = new Map<string, { seen: Map<number, number>; thai: boolean }>();
  for (const { item } of rows) {
    const parts = item?.replace(/\.$/, "").split(".");
    if (!parts?.length || !/^[0-9๐-๙]+$/.test(parts[parts.length - 1])) continue;
    const parent = parts.slice(0, -1).join(".");
    const group = siblings.get(parent) ?? { seen: new Map(), thai: false };
    const n = toNumber(parts[parts.length - 1]);
    group.seen.set(n, (group.seen.get(n) ?? 0) + 1);
    group.thai ||= /[๐-๙]/.test(parts[parts.length - 1]);
    siblings.set(parent, group);
  }
  const repeated: string[] = [];
  const missing: string[] = [];
  for (const [parent, { seen, thai }] of siblings) {
    const name = (n: number) => `${parent ? `${parent}.` : ""}${thai ? toThai(n) : n}`;
    const numbers = [...seen.keys()];
    for (const [n, count] of seen) if (count > 1) repeated.push(name(n));
    for (let n = Math.min(...numbers); n < Math.max(...numbers); n++) if (!seen.has(n)) missing.push(name(n));
  }
  if (missing.length) warnings.push(`เลขข้อที่อาจขาดไป (อ่านพลาดหรือข้ามแถว): ${listed(missing)}`);
  if (repeated.length) warnings.push(`เลขข้อที่ซ้ำกัน (อาจอ่านเลขข้อผิด): ${listed(repeated)}`);

  const where = (row: ScannedRow) => (row.item ? `ข้อ ${row.item} (หน้า ${row.page})` : `แถวหน้า ${row.page}`);
  const emptyTor = rows.filter((row) => !row.tor && !row.figure);
  if (emptyTor.length) warnings.push(`ช่องข้อกำหนด TOR ว่างจากการอ่าน: ${listed(emptyTor.map(where))}`);
  const doubled = rows.filter((row) => row.text.some((text) => DOUBLED_WORD.test(text)));
  if (doubled.length) warnings.push(`พบคำซ้ำติดกันในช่อง (OCR อาจอ่านซ้ำ): ${listed(doubled.map(where))}`);
  return warnings;
}
