// The PDF SOC converter (ADR 0009): a text PDF SOC in; the .xlsx the job keeps
// as its SOC document, the PDF page of each SOC row, and upload warnings out.
// Job creation (lib/soc.ts) then reads the .xlsx with the SOC table reader
// like any Excel SOC, so nothing downstream learns about PDFs. Server-only.
//
// On each page, the table's cells come from its ruling lines: a grid from
// every horizontal and vertical line, two neighbouring grid cells joined where
// no line separates them (as Excel merges cells). Each character of the
// page's text goes to the cell it sits in. The table finder's own cell text is
// not used: it puts Thai below-base vowels (ุ ู) on lines of their own.
//
// The header is found by the Excel reader's rules (lib/soc-table-excel.ts). A
// page that repeats it starts its rows under it; a page without it goes on
// with the columns of the last header; a page before any header (a cover) is
// skipped. A row cut by a page break stays two rows.
//
// A SOC whose header has no item column (it writes "๔.๓.๑ การเริ่มจัด…" in the
// TOR cell) is read too: each row's item number is the dotted number its TOR
// text starts with, and a row without one is unnumbered. An item column, when
// there is one, is always used.
//
// A page with no text is a scan. Without a cell reader it is skipped and named
// in a warning, and a PDF with scans and no table on its text pages is refused
// as a scanned PDF SOC. With one (ADR 0010) the scan's ruled table is cut into
// cells (lib/soc-scan-grid.ts), each cell with ink is read by the cell reader,
// and the page then goes through the same header and row rules as a text page.
// A scan whose grid can't be cut is skipped and named; when more than half of
// the table pages can't be cut the file is refused. A cell the reader answers
// with only a figure is a picture: it is put in the .xlsx in that cell. A text
// page with no SOC table (a signature page) is skipped silently. Pictures in
// TOR cells of text pages are counted into a warning, not read.
import ExcelJS from "exceljs";
import * as mupdf from "mupdf";
import { scanQualityWarnings } from "@/lib/soc-scan-quality";
import { cutScannedPage, type ScannedTable } from "@/lib/soc-scan-grid";
import { findSocHeader, type SocColumns, type SocGrid } from "@/lib/soc-table-excel";

export type PdfSoc = {
  xlsx: Uint8Array; // one sheet: a header row, then one row per SOC row
  rowPages: number[]; // the 1-based PDF page of each SOC row, in order
  warnings: string[];
};

const UNREADABLE_PDF = "ไม่สามารถเปิดไฟล์ PDF ของ SOC ได้ ไฟล์อาจเสีย กรุณาตรวจไฟล์แล้วอัปโหลดใหม่";
const LOCKED_PDF = "ไฟล์ PDF ของ SOC ใส่รหัสผ่านไว้ กรุณาเอารหัสผ่านออกแล้วอัปโหลดใหม่";
const SCANNED_PDF = "SOC นี้เป็น PDF แบบสแกน ระบบยังไม่รองรับ กรุณาอัปโหลดไฟล์ Word หรือ Excel ถ้ามี";
const SCAN_NOT_CUT = "ตัดตารางจาก PDF แบบสแกนไม่ได้ ตารางต้องมีเส้นตารางที่ชัดเจน กรุณาอัปโหลดไฟล์ Word หรือ Excel ถ้ามี";
const NO_SOC_TABLE = "ไม่พบตาราง SOC ในไฟล์ PDF: ต้องมีแถวหัวตารางที่มีคอลัมน์ ข้อกำหนด TOR และ ข้อเสนอ";

type Role = keyof SocColumns;
// The generated sheet's columns, in this order, named so that the web's and
// the skill's Excel readers both recognise them. Only the SOC's own columns
// are written, so no other column can be taken for the reference column.
const COLUMN_NAMES: [Role, string][] = [
  ["item", "ลำดับ"], ["tor", "ข้อกำหนด TOR"], ["proposal", "ข้อเสนอ"],
  ["comply", "ตรงข้อกำหนด"], ["better", "ดีกว่าข้อกำหนด"], ["reference", "เอกสารอ้างอิง"], ["remark", "หมายเหตุ"],
];
// An item number at the start of a TOR text, dotted, kept as typed: "๔.",
// "๔.๓.๑", "4.3.2". A number without a dot ("10 ช่อง") is not one.
const LEADING_ITEM = /^(?:[0-9๐-๙]+\.)+[0-9๐-๙]*/;
const CHECK_MARK = /[✓✔√☑☒🗸]/u;
const TICK = "✓"; // a check mark the skill reads as a tick

const LINE_THICKNESS = 2.5; // a filled rectangle at most this thin is a ruling line
const SAME_LINE = 1.5; // ruling lines this close are one grid line
const TOUCH = 2; // a line ends this close to another still meets it
const SCAN_DRIFT = 15; // a scan's column line this close (points) to a known column's is that column's

// Reads one cell of a scanned page (a PNG): its text, or null when the cell
// holds only a figure. `at` is the cell's 1-based page and 0-based row and
// column in the page's table, header row first.
export type CellReader = (image: Uint8Array, at: { page: number; row: number; column: number }) => Promise<string | null>;

// Without `readCell` a scanned page is skipped. The reader's own errors pass through unchanged.
// `onPage(done, total)` is called before each page is read, for progress.
export async function convertPdfSoc(pdf: Uint8Array, { readCell, onPage }: { readCell?: CellReader; onPage?: (done: number, total: number) => void | Promise<void> } = {}): Promise<PdfSoc> {
  let document: mupdf.Document;
  try {
    document = mupdf.Document.openDocument(pdf, "application/pdf");
  } catch {
    throw new Error(UNREADABLE_PDF);
  }
  const rows: { cells: Partial<Record<Role, string>>; page: number; scanned: boolean; figure?: Uint8Array }[] = [];
  const named = new Set<Role>();
  const scannedPages: number[] = []; // scans that are skipped
  const uncutPages: number[] = []; // scans whose grid can't be cut
  let tablePages = 0; // scans read with the cell reader, and text pages with a table
  let readerError: unknown = null;
  let torImages = 0;
  try {
    if (document.needsPassword()) throw new Error(LOCKED_PDF);
    let columns: { role: Role; left: number }[] | null = null; // by left edge
    let itemlessHeader: string | null = null; // the last header's key when it has no item column; null: none yet, or it has one
    const pageCount = document.countPages();
    for (let index = 0; index < pageCount; index++) {
      try {
        await onPage?.(index, pageCount);
      } catch (error) {
        readerError = error; // the caller's own error passes through, like the reader's
        throw error;
      }
      const page = document.loadPage(index);
      let read: PageRead;
      let scan: ScannedTable | null = null;
      try {
        read = readPage(page);
        if (read === "scanned" && readCell) scan = cutScannedPage(page);
      } finally {
        page.destroy();
      }
      let table: PageTable | null;
      if (read === "scanned" && readCell) {
        tablePages++;
        if (!scan) { uncutPages.push(index + 1); continue; }
        try {
          table = await readScan(scan, index + 1, readCell);
        } catch (error) {
          readerError = error;
          throw error;
        }
      } else {
        if (read === "scanned") scannedPages.push(index + 1);
        if (read === "scanned" || read === "blank") continue;
        table = read.table;
        if (table) tablePages++;
      }
      if (!table) continue;
      let header = findSocHeader(table.grid, nameKey);
      // A header with no item column is looked for only while no header with
      // one is known. A later page must repeat it exactly: a row that only reads
      // like one ("ตามที่กำหนด", "ผู้เสนอ") stays a SOC row.
      if (!header && (!columns || itemlessHeader !== null)) {
        const found = findSocHeader(table.grid, nameKey, { needsItem: false });
        if (found && (itemlessHeader === null || headerKey(table.grid, found) === itemlessHeader)) header = found;
      }
      let first = 0;
      if (header) {
        itemlessHeader = header.columns.item < 0 ? headerKey(table.grid, header) : null;
        columns = (Object.entries(header.columns) as [Role, number][])
          .filter(([, column]) => column >= 0)
          .map(([role, column]) => ({ role, left: table.columnEdges[column] }))
          .sort((a, b) => a.left - b.left);
        for (const { role } of columns) named.add(role);
        first = header.last + 1;
      } else if (!columns) continue;
      const known = columns;
      // A scan's column lines drift a little from page to page: without a
      // header of its own, a scan's column lines are those of the known columns they sit at.
      if (!header && scan) table.columnEdges = table.columnEdges.map((x) => known.find((column) => Math.abs(column.left - x) <= SCAN_DRIFT)?.left ?? x);
      const roleAt = (x: number) => known.findLast((column) => column.left <= x + TOUCH)?.role;
      for (let row = first; row < table.grid.rows.length; row++) {
        const cells: Partial<Record<Role, string>> = {};
        table.grid.rows[row]?.forEach((text, column) => {
          const role = text ? roleAt(table.columnEdges[column]) : undefined;
          if (role) cells[role] = cells[role] ? `${cells[role]} ${text}` : text;
        });
        if (Object.keys(cells).length) {
          const figure = table.figures?.find((cell) => cell.row === row && roleAt(table.columnEdges[cell.column]) === "tor");
          rows.push({ cells, page: index + 1, scanned: Boolean(scan), ...(figure ? { figure: figure.image } : {}) });
        }
      }
      torImages += table.images.filter((image) => image.row >= first && roleAt(table.columnEdges[image.column]) === "tor").length;
    }
  } catch (error) {
    if (error === readerError || (error instanceof Error && error.message === LOCKED_PDF)) throw error;
    // mupdf can't parse a page. Logged, so that a fault of this converter
    // isn't only ever seen as a damaged file.
    console.error("PDF SOC conversion failed", error);
    throw new Error(UNREADABLE_PDF);
  } finally {
    document.destroy();
  }
  if (uncutPages.length * 2 > tablePages) throw new Error(SCAN_NOT_CUT);
  // No table in the text pages, but some pages are scans: the table is in the scans.
  if (!rows.length) throw new Error(scannedPages.length ? SCANNED_PDF : NO_SOC_TABLE);
  const warnings = [
    ...(scannedPages.length ? [`หน้า ${pageRanges(scannedPages)} เป็นภาพสแกน ไม่ได้ตรวจ`] : []),
    ...(uncutPages.length ? [`หน้า ${pageRanges(uncutPages)} เป็นภาพสแกนที่ตัดตารางไม่ได้ ไม่ได้ตรวจ`] : []),
    ...(torImages ? [`มีรูป ${torImages} รูปในช่องข้อกำหนด TOR ของ PDF SOC ที่ยังไม่อ่าน ระบบตรวจเฉพาะข้อความในเซลล์ กรุณาดูรูปเหล่านี้เอง`] : []),
  ];

  // No item column: each row's item number is the one its TOR text starts with,
  // written into the item column and left in the text.
  if (!named.has("item")) {
    named.add("item");
    for (const { cells } of rows) {
      const item = cells.tor?.match(LEADING_ITEM)?.[0];
      if (item) cells.item = item;
    }
  }

  warnings.push(...scanQualityWarnings(rows.filter((row) => row.scanned).map(({ cells, page, figure }) => ({
    item: cells.item, tor: cells.tor, page, figure: Boolean(figure), text: [cells.tor, cells.proposal, cells.reference, cells.remark].filter((t): t is string => Boolean(t)),
  }))));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("SOC");
  const written = COLUMN_NAMES.filter(([role]) => named.has(role));
  sheet.addRow(written.map(([, name]) => name));
  for (const { cells, figure } of rows) {
    const added = sheet.addRow(written.map(([role]) => {
      const text = cells[role];
      if (!text) return null;
      return (role === "comply" || role === "better") && CHECK_MARK.test(text) ? TICK : text;
    }));
    if (figure) {
      const image = workbook.addImage({ buffer: Buffer.from(figure) as unknown as ExcelJS.Buffer, extension: "png" });
      sheet.addImage(image, { tl: { col: written.findIndex(([role]) => role === "tor"), row: added.number - 1 }, ext: { width: 120, height: 40 } });
    }
  }
  return { xlsx: new Uint8Array(await workbook.xlsx.writeBuffer()), rowPages: rows.map((row) => row.page), warnings };
}

// A header's column names are matched with the spaces of their line breaks left out.
const nameKey = (name: string) => name.replace(/\s+/g, "");
const headerKey = (grid: SocGrid, { first, last }: { first: number; last: number }) =>
  grid.rows.slice(first, last + 1).flatMap((cells) => (cells ?? []).filter(Boolean).map(nameKey)).join("|");

// Ascending page numbers as ranges: [2, 3, 6] → "2–3, 6".
function pageRanges(pages: number[]): string {
  const ranges: [number, number][] = [];
  for (const page of pages) {
    const last = ranges[ranges.length - 1];
    if (last && page === last[1] + 1) last[1] = page;
    else ranges.push([page, page]);
  }
  return ranges.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(", ");
}

// A page: a scan (pictures and no text), blank, or a text page with its table
// if it has one. A table is a grid (text at each cell's top left, merges as in
// a sheet), the x of each grid column's left edge, and the cell (top left) of
// each picture inside the table.
type PageRead = "scanned" | "blank" | { table: PageTable | null };
type PageTable = { grid: SocGrid; columnEdges: number[]; images: { row: number; column: number }[]; figures?: { row: number; column: number; image: Uint8Array }[] };

// A cut scan as a page table: the reader's text in each cell with ink; a
// figure-only cell is kept as its image.
async function readScan(scan: ScannedTable, page: number, readCell: CellReader): Promise<PageTable> {
  const grid: SocGrid = { rows: [], merges: [] };
  const figures: NonNullable<PageTable["figures"]> = [];
  for (let row = 0; row < scan.rows.length; row++) {
    for (let column = 0; column < scan.rows[row].length; column++) {
      const image = scan.rows[row][column];
      if (!image) continue;
      const text = await readCell(image, { page, row, column });
      if (text === null) figures.push({ row, column, image });
      else if (text.trim()) (grid.rows[row] ??= [])[column] = text.trim();
    }
  }
  return { grid, columnEdges: scan.columnEdges, images: [], figures };
}

// Whether the PDF has a scanned page with a table the cell reader would be
// given, so the upload must go through OCR. Looks at the pages only, no OCR.
export function hasScannedTable(pdf: Uint8Array): boolean {
  let document: mupdf.Document;
  try {
    document = mupdf.Document.openDocument(pdf, "application/pdf");
  } catch {
    return false;
  }
  try {
    if (document.needsPassword()) return false;
    for (let index = 0; index < document.countPages(); index++) {
      const page = document.loadPage(index);
      try {
        if (readPage(page) === "scanned" && cutScannedPage(page)) return true;
      } finally {
        page.destroy();
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    document.destroy();
  }
}

type Segment = { at: number; from: number; to: number }; // horizontal: y and x range; vertical: x and y range
type Char = { char: string; x: number; lineY: number; line: number };

function readPage(page: mupdf.Page): PageRead {
  const { horizontal, vertical, images } = drawing(page);
  const chars = pageChars(page);
  if (!chars.some(({ char }) => /\S/.test(char))) return images.length ? "scanned" : "blank";
  const ys = gridLines(horizontal.map((line) => line.at));
  const xs = gridLines(vertical.map((line) => line.at));
  if (ys.length < 2 || xs.length < 2) return { table: null };
  const bands = ys.length - 1;
  const width = xs.length - 1;
  const covered = (lines: Segment[], at: number, point: number) =>
    lines.some((line) => Math.abs(line.at - at) <= SAME_LINE && line.from - TOUCH <= point && point <= line.to + TOUCH);

  // Grid cells joined where no ruling line separates them.
  const parent = Array.from({ length: bands * width }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (let row = 0; row < bands; row++) {
    for (let column = 0; column < width; column++) {
      const middleY = (ys[row] + ys[row + 1]) / 2;
      const middleX = (xs[column] + xs[column + 1]) / 2;
      if (column + 1 < width && !covered(vertical, xs[column + 1], middleY)) join(row * width + column, row * width + column + 1);
      if (row + 1 < bands && !covered(horizontal, ys[row + 1], middleX)) join(row * width + column, (row + 1) * width + column);
    }
  }
  const spans = new Map<number, { top: number; left: number; bottom: number; right: number }>();
  for (let i = 0; i < parent.length; i++) {
    const [row, column] = [Math.floor(i / width), i % width];
    const span = spans.get(find(i));
    if (!span) spans.set(find(i), { top: row, left: column, bottom: row, right: column });
    else Object.assign(span, { top: Math.min(span.top, row), left: Math.min(span.left, column), bottom: Math.max(span.bottom, row), right: Math.max(span.right, column) });
  }

  // Each character goes to the cell it sits in: across by its own position,
  // down by its line's middle (a below-base vowel hangs under the line).
  const indexIn = (edges: number[], value: number) => {
    if (value < edges[0] || value >= edges[edges.length - 1]) return -1;
    let i = 0;
    while (value >= edges[i + 1]) i++;
    return i;
  };
  const cellAt = (x: number, y: number) => {
    const row = indexIn(ys, y);
    const column = indexIn(xs, x);
    return row < 0 || column < 0 ? -1 : find(row * width + column);
  };
  const pieces = new Map<number, { y: number; x: number; text: string }[]>();
  type Piece = { cell: number; line: number; y: number; x: number; text: string };
  const keep = (piece: Piece | null) => {
    if (piece?.text) pieces.set(piece.cell, [...(pieces.get(piece.cell) ?? []), piece]);
  };
  let current: Piece | null = null;
  for (const { char, x, lineY, line } of chars) {
    const cell = cellAt(x, lineY);
    if (!current || current.cell !== cell || current.line !== line) {
      keep(current);
      current = cell >= 0 ? { cell, line, y: lineY, x, text: "" } : null;
    }
    if (current) current.text += char;
  }
  keep(current);
  const tableImages: { row: number; column: number }[] = [];
  for (const { x, y } of images) {
    const cell = cellAt(x, y);
    const span = cell < 0 ? undefined : spans.get(cell);
    if (span) tableImages.push({ row: span.top, column: span.left });
  }

  const cellLines = new Map([...pieces].map(([cell, parts]) => [cell, parts.sort((a, b) => a.y - b.y || a.x - b.x).map((piece) => piece.text)]));
  const keepsSpaces = [...cellLines.values()].some((lines) => lines.slice(0, -1).some((line) => /\s$/.test(line)));
  const grid: SocGrid = { rows: [], merges: [] };
  for (const [cell, span] of spans) {
    if (span.bottom > span.top || span.right > span.left) grid.merges.push(span);
    const cellText = joinLines(cellLines.get(cell) ?? [], keepsSpaces);
    if (cellText) (grid.rows[span.top] ??= [])[span.left] = cellText;
  }
  return { table: { grid, columnEdges: xs, images: tableImages } };
}

// Each character of the page's text, with its x and its line's middle y.
function pageChars(page: mupdf.Page): Char[] {
  const chars: Char[] = [];
  let lineY = 0;
  let line = 0;
  const text = page.toStructuredText("preserve-whitespace");
  try {
    text.walk({
      beginLine(bbox) { lineY = (bbox[1] + bbox[3]) / 2; line++; },
      onChar(char, _origin, _font, _size, quad) {
        chars.push({ char, x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4, lineY, line });
      },
    });
  } finally {
    text.destroy();
  }
  return chars;
}

// What the page draws: its ruling lines, thin filled rectangles (how Word
// draws borders) and straight stroked lines, kept only when they meet a line
// across them, so an underline or a rule under the page title is not taken
// for the table; and the middle of each picture.
function drawing(page: mupdf.Page): { horizontal: Segment[]; vertical: Segment[]; images: { x: number; y: number }[] } {
  const horizontal: Segment[] = [];
  const vertical: Segment[] = [];
  const images: { x: number; y: number }[] = [];
  // A picture fills the unit square under its matrix.
  const picture = (ctm: mupdf.Matrix) => images.push({ x: ctm[4] + (ctm[0] + ctm[2]) / 2, y: ctm[5] + (ctm[1] + ctm[3]) / 2 });
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    if (Math.abs(y1 - y0) <= LINE_THICKNESS && Math.abs(x1 - x0) > LINE_THICKNESS) horizontal.push({ at: (y0 + y1) / 2, from: Math.min(x0, x1), to: Math.max(x0, x1) });
    else if (Math.abs(x1 - x0) <= LINE_THICKNESS && Math.abs(y1 - y0) > LINE_THICKNESS) vertical.push({ at: (x0 + x1) / 2, from: Math.min(y0, y1), to: Math.max(y0, y1) });
  };
  const points = (path: mupdf.Path, ctm: mupdf.Matrix) => {
    const subpaths: [number, number][][] = [];
    const at = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    path.walk({
      moveTo: (x, y) => { subpaths.push([at(x, y)]); },
      lineTo: (x, y) => { subpaths[subpaths.length - 1]?.push(at(x, y)); },
      closePath: () => { const subpath = subpaths[subpaths.length - 1]; if (subpath) subpath.push(subpath[0]); },
    });
    return subpaths;
  };
  const device = new mupdf.Device({
    fillPath(path, _evenOdd, ctm) {
      for (const subpath of points(path, ctm)) {
        const xs = subpath.map(([x]) => x);
        const ys = subpath.map(([, y]) => y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        if (y1 - y0 <= LINE_THICKNESS) add(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2);
        else if (x1 - x0 <= LINE_THICKNESS) add((x0 + x1) / 2, y0, (x0 + x1) / 2, y1);
      }
    },
    strokePath(path, _stroke, ctm) {
      for (const subpath of points(path, ctm)) {
        for (let i = 1; i < subpath.length; i++) add(subpath[i - 1][0], subpath[i - 1][1], subpath[i][0], subpath[i][1]);
      }
    },
    fillImage(_image, ctm) { picture(ctm); },
    fillImageMask(_image, ctm) { picture(ctm); }, // a 1-bit scan (fax, JBIG2)
  });
  try {
    page.run(device, mupdf.Matrix.identity);
    device.close();
  } finally {
    device.destroy();
  }
  const meets = (line: Segment, across: Segment[]) =>
    across.some((other) => other.at >= line.from - TOUCH && other.at <= line.to + TOUCH && line.at >= other.from - TOUCH && line.at <= other.to + TOUCH);
  return { horizontal: horizontal.filter((line) => meets(line, vertical)), vertical: vertical.filter((line) => meets(line, horizontal)), images };
}

// Positions of lines drawn at (nearly) the same place, as one each.
function gridLines(positions: number[]): number[] {
  const groups: number[][] = [];
  for (const position of [...positions].sort((a, b) => a - b)) {
    const last = groups[groups.length - 1];
    if (last && position - last[last.length - 1] <= SAME_LINE) last.push(position);
    else groups.push([position]);
  }
  return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
}

// A cell's lines as one text. On a page whose broken lines end with their
// space (`keepsSpaces`, as Word exports them), the lines are joined as
// printed: a line without one was broken inside a word ("MJP|EG"). Otherwise
// a line break is a space, except between two Thai characters (Thai doesn't
// space its words, so a line breaks between words without one).
const THAI = /[฀-๿]/;
function joinLines(lines: string[], keepsSpaces: boolean): string {
  let text = "";
  for (const line of lines) {
    const before = text.at(-1) ?? "";
    if (!keepsSpaces && text && !/\s/.test(before) && !/^\s/.test(line) && !(THAI.test(before) && THAI.test(line[0]))) text += " ";
    text += line;
  }
  return text.replace(/\s+/g, " ").trim();
}
