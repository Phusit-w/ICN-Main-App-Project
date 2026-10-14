// Builds PDF SOCs for tests: tables drawn the way Word exports them (each
// cell's borders as thin filled rectangles, or stroked lines), with text in
// any script. mupdf has no Thai font built in, so the text uses Helvetica
// with a ToUnicode map: it doesn't look right, but it extracts exactly.
import * as mupdf from "mupdf";

// A cell's text ("\n" between lines), with how many columns and rows it covers.
export type TableCell = string | { text: string; span?: number; rowSpan?: number };
// One page: the column widths and the rows; `textAbove` is a title outside the table.
export type TablePage = { columns: number[]; rows: TableCell[][]; stroked?: boolean; textAbove?: string };

const PAGE: [number, number] = [842, 595];
const LEFT = 40;
const TOP = 80;
const FONT_SIZE = 10;
const CHAR_WIDTH = 4; // every character, so lines are short and stay in their cell
const LINE_HEIGHT = 14;

export function buildTablePdf(pages: TablePage[]): Uint8Array<ArrayBuffer> {
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
        const { text, span = 1, rowSpan = 1 } = typeof cell === "string" ? { text: cell } : cell;
        for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + span; c++) taken.add(`${r}:${c}`);
        const [x0, x1, y0, y1] = [edges[column], edges[column + span], rowTops[row], rowTops[row + rowSpan]];
        content += line(x0, y0, x1, y0) + line(x0, y1, x1, y1) + line(x0, y0, x0, y1) + line(x1, y0, x1, y1);
        text.split("\n").forEach((textLine, i) => { if (textLine) content += show(textLine, x0 + 3, y0 + 3 + i * LINE_HEIGHT); });
        column += span;
      }
    });
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
  for (const content of contents) doc.insertPage(-1, doc.addPage([0, 0, ...PAGE], 0, { Font: { F1: font } }, content));
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}
