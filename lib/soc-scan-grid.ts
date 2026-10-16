// Cuts a scanned SOC table page into cells along its ruled lines, with no OCR
// (ADR 0010; ported from .scratch/soc-scanned-pdf/prototype/PROTOTYPE_grid.mjs).
// The PDF SOC converter (lib/soc-pdf-soc.ts) sends each cell image to a cell
// reader. Server-only.
//
// A scan is a little rotated, so a ruled line drifts a few pixels across the
// page: lines are found in short chunks, each mostly ink on one pixel line
// (±1), and chunks are chained when the next one is within a few pixels.
//
// A column line runs from the table's top border to its bottom border AND
// crosses the header row: a table drawn inside a TOR cell has verticals of its
// own that start below the header, so they add no column. A row border is a
// horizontal line crossing every column but the first (the first can be broken
// by an inner table's border, and holds rules under its own text lines).
import * as mupdf from "mupdf";

export type ScannedTable = {
  columnEdges: number[]; // PDF points: the x of every column line, left to right
  rows: (Uint8Array | null)[][]; // the table's rows, header first; one PNG per cell, null for a cell with no ink
};

const DPI = 100; // the page is cut at this resolution …
const CELL_SCALE = 3; // … and each cell is read from the page at 3 times it
const DARK = 190; // gray value below this is ink
const CHUNK = 40;
const MIN_ROW = 8;
// Share of a cell's samples that are ink below which it is empty. The prototype
// used 0.004, which called empty two cells holding one short line in a tall cell.
const INK_EMPTY = 0.001;
const CELL_INSET = 2;
const CELL_PAD = 24; // white around a cell image

type Chain = { pos: number; from: number; to: number; length: number };

export function cutScannedPage(page: mupdf.Page): ScannedTable | null {
  const gray = mupdf.ColorSpace.DeviceGray;
  const pixmap = page.toPixmap(mupdf.Matrix.scale(DPI / 72, DPI / 72), gray, false);
  let grid: ReturnType<typeof findGrid>;
  try {
    grid = findGrid(pixmap);
  } finally {
    pixmap.destroy();
  }
  if (!grid) return null;
  const big = page.toPixmap(mupdf.Matrix.scale((DPI * CELL_SCALE) / 72, (DPI * CELL_SCALE) / 72), gray, false);
  try {
    return {
      columnEdges: grid.vx.map((x) => (x * 72) / DPI),
      rows: grid.rows.map((row) => row.cells.map((cell) => (cell.ink < INK_EMPTY ? null : cropCell(big, cell.left, row.top, cell.right, row.bottom)))),
    };
  } finally {
    big.destroy();
  }
}

function findGrid(pixmap: mupdf.Pixmap) {
  const [W, H, stride, px] = [pixmap.getWidth(), pixmap.getHeight(), pixmap.getStride(), pixmap.getPixels()];
  const ink = (x: number, y: number) => px[y * stride + x] < DARK;
  const hLines = traceLines(W, H, ink);
  const borders = dedupe(hLines.filter((line) => line.length >= W * 0.5));
  if (borders.length < 2) return null;
  const tableTop = borders[0];
  const headerBottom = borders[1];
  const tableBottom = borders[borders.length - 1];
  const inHeader = (x: number) => {
    let hits = 0;
    let total = 0;
    for (let y = tableTop + 3; y < headerBottom - 3; y++) {
      total++;
      for (let dx = -6; dx <= 6; dx++) if (ink(x + dx, y)) { hits++; break; }
    }
    return total > 0 && hits >= total * 0.8;
  };
  const vx = dedupe(traceLines(H, W, (y, x) => ink(x, y)).filter((line) => line.from <= tableTop + CHUNK && line.to >= tableBottom - CHUNK)).filter(inHeader);
  if (vx.length < 3) return null; // a SOC table has at least a TOR and a proposal column
  const right = vx[vx.length - 1];
  const hy = dedupe(hLines.filter((line) => line.from <= vx[1] + CHUNK && line.to >= right - CHUNK));
  const rows: { top: number; bottom: number; cells: { left: number; right: number; ink: number }[] }[] = [];
  for (let r = 0; r + 1 < hy.length; r++) {
    const [top, bottom] = [hy[r], hy[r + 1]];
    if (bottom - top < MIN_ROW) continue;
    const cells = vx.slice(0, -1).map((left, c) => {
      let dark = 0;
      let total = 0;
      for (let y = top + 3; y < bottom - 3; y += 2) for (let x = left + 3; x < vx[c + 1] - 3; x += 2) { total++; if (ink(x, y)) dark++; }
      return { left, right: vx[c + 1], ink: total ? dark / total : 0 };
    });
    rows.push({ top, bottom, cells });
  }
  return rows.length ? { vx, rows } : null;
}

// A cell as a PNG: cut from the page at CELL_SCALE times the cutting resolution, white around it.
function cropCell(big: mupdf.Pixmap, left: number, top: number, right: number, bottom: number): Uint8Array {
  const [bigW, bigH, bigStride] = [big.getWidth(), big.getHeight(), big.getStride()];
  const x = (left + CELL_INSET) * CELL_SCALE;
  const y = (top + CELL_INSET) * CELL_SCALE;
  const w = Math.max(1, Math.min(bigW - x, (right - left - 2 * CELL_INSET) * CELL_SCALE));
  const h = Math.max(1, Math.min(bigH - y, (bottom - top - 2 * CELL_INSET) * CELL_SCALE));
  const crop = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w + 2 * CELL_PAD, h + 2 * CELL_PAD], false);
  try {
    crop.clear(255);
    const [src, dst, dstStride] = [big.getPixels(), crop.getPixels(), crop.getStride()];
    for (let dy = 0; dy < h; dy++) dst.set(src.subarray((y + dy) * bigStride + x, (y + dy) * bigStride + x + w), (CELL_PAD + dy) * dstStride + CELL_PAD);
    return new Uint8Array(crop.asPNG());
  } finally {
    crop.destroy();
  }
}

// inkAt(a, b): ink at position a along the line, b across it.
function traceLines(len: number, across: number, inkAt: (a: number, b: number) => boolean): Chain[] {
  const chunks: number[][] = [];
  for (let c = 0; c * CHUNK < len; c++) {
    const hits: number[] = [];
    const end = Math.min(len, (c + 1) * CHUNK);
    for (let b = 1; b < across - 1; b++) {
      let n = 0;
      for (let a = c * CHUNK; a < end; a++) if (inkAt(a, b) || inkAt(a, b - 1) || inkAt(a, b + 1)) n++;
      if (n >= (end - c * CHUNK) * 0.85) hits.push(b);
    }
    chunks.push(merge(hits));
  }
  const chains: { firstChunk: number; lastChunk: number; lastPos: number; sum: number; n: number }[] = [];
  chunks.forEach((positions, c) => {
    for (const b of positions) {
      const chain = chains.find((ch) => ch.lastChunk >= c - 2 && ch.lastChunk < c && Math.abs(ch.lastPos - b) <= 3);
      if (chain) { chain.lastChunk = c; chain.lastPos = b; chain.sum += b; chain.n++; }
      else chains.push({ firstChunk: c, lastChunk: c, lastPos: b, sum: b, n: 1 });
    }
  });
  return chains.map((ch) => ({ pos: Math.round(ch.sum / ch.n), from: ch.firstChunk * CHUNK, to: (ch.lastChunk + 1) * CHUNK, length: (ch.lastChunk - ch.firstChunk + 1) * CHUNK }));
}

// Neighbouring positions (a line is 1–4 px thick) as one each.
function merge(positions: number[]): number[] {
  const out: { from: number; to: number }[] = [];
  for (const p of positions) {
    const prev = out[out.length - 1];
    if (prev && p - prev.to <= 3) prev.to = p;
    else out.push({ from: p, to: p });
  }
  return out.map((l) => Math.round((l.from + l.to) / 2));
}

const dedupe = (lines: Chain[]) => merge(lines.map((line) => line.pos).sort((a, b) => a - b));
