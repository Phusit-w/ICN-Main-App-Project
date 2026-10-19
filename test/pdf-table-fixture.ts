// Builds PDF SOCs for tests: tables drawn the way Word exports them (each
// cell's borders as thin filled rectangles, or stroked lines), with text in
// any script. mupdf has no Thai font built in, so the text uses Helvetica
// with a ToUnicode map: it doesn't look right, but it extracts exactly. A page
// can be a scan (one image, no text), a scanned table (a ruled table drawn as
// pixels, with a dark mark in each cell that has text), a cell can hold a
// picture, and the PDF can be locked with a password.
import * as mupdf from "mupdf";

// A cell's text ("\n" between lines), with how many columns and rows it
// covers, and whether a picture sits in it.
export type TableCell = string | { text: string; span?: number; rowSpan?: number; image?: boolean };
// One page: the column widths and the rows; `textAbove` is a title outside the
// table. A `scanned` page is one image covering the page and no text. `lines`
// are text lines under the table (or on their own: no columns, no rows), each
// with the indexes of its characters drawn with a line under them, the way
// Word types ≤ as an underlined <; `picture` puts a picture on the page.
export type TablePage = { columns: number[]; rows: TableCell[][]; stroked?: boolean; textAbove?: string; scanned?: boolean; raster?: RasterTable; lines?: { text: string; underline?: number[] }[]; picture?: boolean };
// A scanned page's table: column widths in pixels (100 per inch, as the cutter
// reads it); one string per cell, "" for no ink; the first row is the header.
// `innerTable` draws a 2 × 2 table inside that cell.
export type RasterTable = { columns: number[]; rows: string[][]; innerTable?: { row: number; column: number } };

const PAGE: [number, number] = [842, 595];
const LEFT = 40;
const TOP = 80;
const FONT_SIZE = 10;
const CHAR_WIDTH = 4; // every character, so lines are short and stay in their cell
const LINE_HEIGHT = 14;

export function buildTablePdf(pages: TablePage[], options: { password?: string } = {}): Uint8Array<ArrayBuffer> {
  const codes = new Map<string, number>([[" ", 32]]);
  const code = (char: string) => {
    let found = codes.get(char);
    if (found === undefined) {
      found = codes.size < 32 ? codes.size : codes.size + 1; // 1…31, then 33… (32 is the space)
      if (found > 255) throw new Error("too many distinct characters for the test font");
      codes.set(char, found);
    }
    return found;
  };
  const show = (text: string, x: number, top: number) =>
    `BT /F1 ${FONT_SIZE} Tf ${x} ${PAGE[1] - top - FONT_SIZE} Td <${[...text].map((char) => code(char).toString(16).padStart(2, "0")).join("")}> Tj ET\n`;

  const contents = pages.map((page) => {
    if (page.scanned || page.raster) return `q ${PAGE[0]} 0 0 ${PAGE[1]} 0 0 cm /Im1 Do Q\n`;
    let content = "0 0 0 rg 0 0 0 RG 0.5 w\n";
    if (page.textAbove) content += show(page.textAbove, LEFT, TOP - 30);
    const edges = [LEFT];
    for (const width of page.columns) edges.push(edges[edges.length - 1] + width);
    const taken = new Set<string>();
    let top = TOP;
    const rowTops: number[] = [];
    const heights = page.rows.map((cells) => Math.max(1, ...cells.map((cell) => (typeof cell === "string" ? cell : cell.text).split("\n").length)) * LINE_HEIGHT + 6);
    for (const height of heights) { rowTops.push(top); top += height; }
    rowTops.push(top);
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const [bx0, by0, bx1, by1] = [x0, PAGE[1] - y0, x1, PAGE[1] - y1];
      if (page.stroked) return `${bx0} ${by0} m ${bx1} ${by1} l S\n`;
      return x0 === x1 ? `${bx0 - 0.25} ${Math.min(by0, by1)} 0.5 ${Math.abs(by1 - by0)} re f\n` : `${Math.min(bx0, bx1)} ${by0 - 0.25} ${Math.abs(bx1 - bx0)} 0.5 re f\n`;
    };
    page.rows.forEach((cells, row) => {
      let column = 0;
      for (const cell of cells) {
        while (taken.has(`${row}:${column}`)) column++;
        const { text, span = 1, rowSpan = 1, image = false } = typeof cell === "string" ? { text: cell } : cell;
        for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + span; c++) taken.add(`${r}:${c}`);
        const [x0, x1, y0, y1] = [edges[column], edges[column + span], rowTops[row], rowTops[row + rowSpan]];
        content += line(x0, y0, x1, y0) + line(x0, y1, x1, y1) + line(x0, y0, x0, y1) + line(x1, y0, x1, y1);
        text.split("\n").forEach((textLine, i) => { if (textLine) content += show(textLine, x0 + 3, y0 + 3 + i * LINE_HEIGHT); });
        if (image) content += `q 8 0 0 8 ${x1 - 12} ${PAGE[1] - y1 + 3} cm /Im1 Do Q\n`; // a small picture in the cell's bottom right
        column += span;
      }
    });
    (page.lines ?? []).forEach(({ text, underline = [] }, i) => {
      const lineTop = top + 10 + i * LINE_HEIGHT;
      if (text) content += show(text, LEFT, lineTop);
      for (const at of underline) content += `${LEFT + at * CHAR_WIDTH} ${PAGE[1] - lineTop - FONT_SIZE - 1} ${CHAR_WIDTH} 0.5 re f\n`;
    });
    if (page.picture) content += `q 200 0 0 150 ${PAGE[0] - 260} 40 cm /Im1 Do Q\n`;
    return content;
  });

  const doc = new mupdf.PDFDocument();
  const toUnicode = [...codes].map(([char, value]) => `<${value.toString(16).padStart(2, "0")}> <${[...char].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("")}>`);
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Test def 1 begincodespacerange <00> <FF> endcodespacerange ${toUnicode.length} beginbfchar ${toUnicode.join(" ")} endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
  const font = doc.addObject({
    Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", FirstChar: 0, LastChar: 255,
    Widths: Array.from({ length: 256 }, () => (CHAR_WIDTH * 1000) / FONT_SIZE),
    ToUnicode: doc.addStream(cmap, {}),
  });
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 4, 4], false);
  pixmap.clear(128);
  const picture = doc.addImage(new mupdf.Image(pixmap));
  pages.forEach((page, i) => {
    const raster = page.raster ? doc.addImage(new mupdf.Image(drawRaster(page.raster))) : picture;
    doc.insertPage(-1, doc.addPage([0, 0, ...PAGE], 0, { Font: { F1: font }, XObject: { Im1: raster } }, contents[i]));
  });
  const locked = options.password ? `encrypt=aes-256,user-password=${options.password},owner-password=${options.password}` : "";
  return new Uint8Array(doc.saveToBuffer(locked).asUint8Array());
}

const RASTER_SIZE: [number, number] = [Math.round((PAGE[0] * 100) / 72), Math.round((PAGE[1] * 100) / 72)];
const RASTER_LEFT = 60;
const RASTER_TOP = 60;
const RASTER_ROW = 70;
const RASTER_LINE = 4;

function drawRaster({ columns, rows, innerTable }: RasterTable): mupdf.Pixmap {
  const [width, height] = RASTER_SIZE;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, width, height], false);
  pixmap.clear(255);
  const pixels = pixmap.getPixels();
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) pixels.fill(0, (y + dy) * width + x, (y + dy) * width + x + w);
  };
  const edges = [RASTER_LEFT];
  for (const column of columns) edges.push(edges[edges.length - 1] + column);
  const bottom = RASTER_TOP + rows.length * RASTER_ROW;
  for (let r = 0; r <= rows.length; r++) fill(RASTER_LEFT, RASTER_TOP + r * RASTER_ROW, edges[edges.length - 1] - RASTER_LEFT + RASTER_LINE, RASTER_LINE);
  for (const x of edges) fill(x, RASTER_TOP, RASTER_LINE, bottom - RASTER_TOP + RASTER_LINE);
  rows.forEach((cells, r) => cells.forEach((text, c) => {
    if (text) fill(edges[c] + 14, RASTER_TOP + r * RASTER_ROW + 28, 24, 8); // a dark mark that is not a line
  }));
  if (innerTable) {
    const { row, column } = innerTable;
    const [x0, x1] = [edges[column] + 12, edges[column + 1] - 12];
    const [y0, y1] = [RASTER_TOP + row * RASTER_ROW + 12, RASTER_TOP + (row + 1) * RASTER_ROW - 12];
    for (const y of [y0, (y0 + y1) / 2, y1]) fill(x0, Math.round(y), x1 - x0, RASTER_LINE);
    for (const x of [x0, (x0 + x1) / 2, x1]) fill(Math.round(x), y0, RASTER_LINE, y1 - y0 + RASTER_LINE);
  }
  return pixmap;
}
