// PROTOTYPE — throwaway. Question: can the server cut a Scanned PDF SOC into
// rows and cells from the ruled lines alone (no OCR), so each row becomes an
// Image Row and Claude only has to read the short cells?
//
// Run:  node .scratch/soc-scanned-pdf/prototype/PROTOTYPE_grid.mjs <scan.pdf> [out-dir] [first-last]
// Then open <out-dir>/index.html: every page with the detected rows/columns drawn
// over it, plus a per-page summary and the pages that look wrong.
import * as mupdf from "mupdf";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [pdfPath, outDir = "PROTOTYPE_scan_out", range] = process.argv.slice(2);
const DPI = 100;
const DARK = 190; // gray value below this is ink
const doc = mupdf.Document.openDocument(readFileSync(pdfPath), "application/pdf");
const pageCount = doc.countPages();
const [first, last] = range ? range.split("-").map(Number) : [1, pageCount];
mkdirSync(outDir, { recursive: true });

// A scan is a little rotated, so a ruled line drifts a few pixels across the
// page. Lines are found in short chunks (CHUNK px), each chunk mostly ink on
// one pixel line (±1), then chunks are chained when the next one is within 3 px.
const CHUNK = 40;
function traceLines(len, across, inkAt) {
  // inkAt(a, b): ink at position a along the line, b across it.
  const chunks = [];
  for (let c = 0; c * CHUNK < len; c++) {
    const hits = [];
    for (let b = 1; b < across - 1; b++) {
      let n = 0, total = 0;
      for (let a = c * CHUNK; a < Math.min(len, (c + 1) * CHUNK); a++) { total++; if (inkAt(a, b) || inkAt(a, b - 1) || inkAt(a, b + 1)) n++; }
      if (n >= total * 0.85) hits.push(b);
    }
    chunks.push(merge(hits));
  }
  const chains = [];
  const open = [];
  chunks.forEach((positions, c) => {
    for (const b of positions) {
      const chain = open.find((ch) => ch.lastChunk >= c - 2 && ch.lastChunk < c && Math.abs(ch.lastPos - b) <= 3);
      if (chain) { chain.lastChunk = c; chain.lastPos = b; chain.sum += b; chain.n++; }
      else { const ch = { firstChunk: c, lastChunk: c, lastPos: b, sum: b, n: 1 }; open.push(ch); chains.push(ch); }
    }
  });
  return chains.map((ch) => ({ pos: Math.round(ch.sum / ch.n), from: ch.firstChunk * CHUNK, to: (ch.lastChunk + 1) * CHUNK, length: (ch.lastChunk - ch.firstChunk + 1) * CHUNK }));
}
// Merge neighbouring line positions (a line is 1–4 px thick) into one.
function merge(positions) {
  const out = [];
  for (const p of positions) {
    const prev = out.at(-1);
    if (prev && p - prev.to <= 3) prev.to = p; else out.push({ from: p, to: p });
  }
  return out.map((l) => Math.round((l.from + l.to) / 2));
}
const dedupe = (lines) => merge(lines.map((l) => l.pos).sort((a, b) => a - b));

// Step 2 of the prototype: one image per page with only the short cells, for
// Claude to read. Each row = the first line of the TOR cell (holds the item
// number) + the offer, reference and remark cells, each cut to its ink.
// Rows are stacked top to bottom, split by a black bar; cells by a gray bar.
const SHEET_DPI = 200;
const LINE = 30; // one text line incl. Thai marks, in DPI px
// FULL_TOR=1: column 1 is cut whole (the TOR text), not only its first line.
const FULL_TOR = process.env.FULL_TOR === "1";
function cellSheet(page, vx, rows) {
  const k = SHEET_DPI / DPI;
  const pix = page.toPixmap(mupdf.Matrix.scale(SHEET_DPI / 72, SHEET_DPI / 72), mupdf.ColorSpace.DeviceGray, false);
  const W = pix.getWidth(), src = pix.getPixels();
  // A pixel row is text when it has a few dark pixels but is not a ruled line
  // (skew lets a row border leak a little into the cell).
  // Dark pixels in runs longer than RUN are a piece of a ruled line, not text.
  const RUN = 40;
  const inkRow = (x0, x1, y) => {
    let d = 0, run = 0;
    for (let x = x0; x <= x1; x++) {
      if (x < x1 && src[y * W + x] < DARK) { run++; continue; }
      if (run <= RUN) d += run;
      run = 0;
    }
    return d >= 2;
  };
  const line = Math.round(LINE * k);
  const cut = rows.map((r) => vx.slice(0, -1).map((cx, c) => {
    // Crop close to the column line (text often touches it) but look for ink
    // a little further in, so the line itself does not count as text.
    const x0 = Math.round(cx * k) + 5, xi = x0 + 9;
    const firstLine = c === 0 && !FULL_TOR;
    const x1 = firstLine ? Math.round(cx * k + (vx[1] - cx) * k * 0.35) : Math.round(vx[c + 1] * k) - 12;
    // Small margins: rows can be tight with text right against a border (p49).
    // Pieces of a tilted border inside the cell are skipped by inkRow.
    const top = Math.round(r.top * k) + 5, bottom = Math.round(r.bottom * k) - 3;
    // Ink segments (bands of inked pixel rows; Thai marks above/below a line
    // join it across small gaps). A thin band at the cell's top or bottom
    // edge is a piece of the tilted border; a text line is ~1 LINE tall.
    const segs = [];
    for (let y = top; y < bottom; y++) {
      if (!inkRow(xi, x1, y)) continue;
      const last = segs.at(-1);
      if (last && y - last.y1 <= 6) last.y1 = y + 1; else segs.push({ y0: y, y1: y + 1 });
    }
    const text = segs.filter((s) => !(s.y1 - s.y0 <= 8 && (s.y0 <= top + 8 || s.y1 >= bottom - 8)));
    // The text block ends at the first blank gap of ~1 line (drops a stray
    // speck far below). Column 1 keeps only its first line: the item number.
    let y0 = text.length ? text[0].y0 : top, y1 = y0;
    for (const s of text) {
      if (s.y0 - y1 > line && y1 > y0) break;
      y1 = s.y1;
      if (firstLine) break;
    }
    if (firstLine) y1 = Math.min(y1, y0 + Math.round(line * 1.3));
    // Rightmost ink, so each column can be cut to the widest text on the page.
    let xr = xi;
    for (let y = y0; y < y1; y++) for (let x = x1 - 1; x > xr; x--) if (src[y * W + x] < DARK) { xr = x; break; }
    return { x0, x1, xr, y0: Math.max(0, y0 - 4), y1: y1 > y0 ? y1 + 4 : y0 };
  }));
  const colRight = vx.slice(0, -1).map((_, c) => Math.max(...cut.map((cells) => Math.min(cells[c].x1, cells[c].xr + 8)), cut[0][c].x0 + 40));
  const strips = cut.map((cells) => cells.map((cell, c) => ({ ...cell, x1: cell.x0 + (colRight[c] - cut[0][c].x0) })));
  const GAP = 6, BAR = 6;
  const sheetW = strips[0].reduce((s, c) => s + c.x1 - c.x0, 0) + GAP * 3;
  const heights = strips.map((cells) => Math.max(24, ...cells.map((c) => c.y1 - c.y0)));
  const sheetH = heights.reduce((s, h) => s + h, 0) + BAR * (strips.length + 1);
  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, sheetW, sheetH], false);
  out.clear(255);
  const dst = out.getPixels();
  const fill = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) dst.fill(v, y * sheetW + x0, y * sheetW + x0 + w); };
  let y = 0;
  strips.forEach((cells, i) => {
    fill(0, y, sheetW, BAR, 0); y += BAR;
    let x = 0;
    cells.forEach((c, j) => {
      for (let dy = 0; dy < c.y1 - c.y0; dy++) dst.set(src.subarray((c.y0 + dy) * W + c.x0, (c.y0 + dy) * W + c.x1), (y + dy) * sheetW + x);
      x += c.x1 - c.x0;
      if (j < cells.length - 1) { fill(x, y, GAP, heights[i], 160); x += GAP; }
    });
    y += heights[i];
  });
  fill(0, y, sheetW, BAR, 0);
  return out.asPNG();
}

function cropPng(pix, x, y, w, h) {
  const W = pix.getWidth(), src = pix.getPixels();
  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false);
  const dst = out.getPixels();
  for (let dy = 0; dy < h; dy++) dst.set(src.subarray((y + dy) * W + x, (y + dy) * W + x + w), dy * w);
  return out.asPNG();
}

const pages = [];
for (let n = first; n <= last; n++) {
  const page = doc.loadPage(n - 1);
  const pix = page.toPixmap(mupdf.Matrix.scale(DPI / 72, DPI / 72), mupdf.ColorSpace.DeviceGray, false);
  const W = pix.getWidth(), H = pix.getHeight(), px = pix.getPixels();
  const ink = (x, y) => px[y * W + x] < DARK;

  // Vertical lines: only lines running from the table's top border to its
  // bottom border AND crossing the header row are column lines. A table drawn
  // inside a TOR cell (pp. 7, 30) has its own verticals; they start below the
  // header, and two such tables in a row can line up into one long line (p30).
  const hLines = traceLines(W, H, (x, y) => ink(x, y));
  const borders = dedupe(hLines.filter((l) => l.length >= W * 0.5));
  const tableTop = borders[0], headerBottom = borders[1], tableBottom = borders.at(-1);
  const inHeader = (x) => {
    let n = 0, total = 0;
    for (let y = tableTop + 3; y < headerBottom - 3; y++) { total++; for (let dx = -6; dx <= 6; dx++) if (ink(x + dx, y)) { n++; break; } }
    return total > 0 && n >= total * 0.8;
  };
  const vx = dedupe(traceLines(H, W, (y, x) => ink(x, y)).filter((l) => l.from <= tableTop + CHUNK && l.to >= tableBottom - CHUNK)).filter(inHeader);
  const left = vx[0], right = vx.at(-1);
  const tableW = right - left;
  // Row borders: horizontal lines crossing columns 2–4 (offer, reference,
  // remark), which are always clean. Column 1 can break the line (an inner
  // table's border right next to it, p30), and a rule under each TOR line
  // (p.2) stays inside column 1, so it is not a row border.
  const isBorder = (l) => l.from <= vx[1] + CHUNK && l.to >= right - CHUNK;
  const hy = dedupe(hLines.filter(isBorder));
  const partialH = dedupe(hLines.filter((l) => l.length >= tableW * 0.15 && !isBorder(l))).length;

  // Ink in each cell (share of dark pixels), so empty cells can be told apart.
  const rows = [];
  for (let r = 0; r + 1 < hy.length; r++) {
    const top = hy[r], bottom = hy[r + 1];
    if (bottom - top < 8) continue;
    const cells = [];
    for (let c = 0; c + 1 < vx.length; c++) {
      let dark = 0, total = 0;
      for (let y = top + 3; y < bottom - 3; y += 2) for (let x = vx[c] + 3; x < vx[c + 1] - 3; x += 2) { total++; if (ink(x, y)) dark++; }
      cells.push({ left: vx[c], right: vx[c + 1], ink: total ? dark / total : 0 });
    }
    rows.push({ top, bottom, cells });
  }
  const png = `page-${String(n).padStart(3, "0")}.png`;
  writeFileSync(path.join(outDir, png), pix.asPNG());
  if (rows.length > 1) writeFileSync(path.join(outDir, `cells-${String(n).padStart(3, "0")}.png`), cellSheet(page, vx, rows.slice(1)));
  // ROW_PNGS=1: each body row as its own image (full table width), for an OCR
  // service that reads one row at a time (PROTOTYPE_typhoon.mjs rows mode).
  if (process.env.ROW_PNGS === "1") rows.slice(1).forEach((r, i) => {
    const pad = 4, x = left - pad, y = r.top - pad;
    writeFileSync(path.join(outDir, `row-${String(n).padStart(3, "0")}-${String(i + 1).padStart(2, "0")}.png`),
      cropPng(pix, x, y, tableW + 2 * pad, r.bottom - r.top + 2 * pad));
  });
  // CELL_PNGS=1: each body cell with ink as its own 300 DPI image, padded with
  // white, for an OCR service that reads one cell at a time.
  if (process.env.CELL_PNGS === "1") {
    const k = 3, inset = 2, pad = 24;
    const hi = page.toPixmap(mupdf.Matrix.scale((DPI * k) / 72, (DPI * k) / 72), mupdf.ColorSpace.DeviceGray, false);
    rows.slice(1).forEach((r, i) => r.cells.forEach((cell, c) => {
      if (cell.ink < 0.004) return;
      const x = (cell.left + inset) * k, y = (r.top + inset) * k;
      const w = (cell.right - cell.left - 2 * inset) * k, h = (r.bottom - r.top - 2 * inset) * k;
      if (w <= 0 || h <= 0) return;
      const crop = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w + 2 * pad, h + 2 * pad], false);
      crop.clear(255);
      const src = hi.getPixels(), dst = crop.getPixels(), HW = hi.getWidth();
      for (let dy = 0; dy < h; dy++) dst.set(src.subarray((y + dy) * HW + x, (y + dy) * HW + x + w), (pad + dy) * (w + 2 * pad) + pad);
      writeFileSync(path.join(outDir, `cell-${String(n).padStart(3, "0")}-${String(i + 1).padStart(2, "0")}-${c + 1}.png`), crop.asPNG());
    }));
  }
  const issues = [];
  if (vx.length !== 5) issues.push(`${vx.length - 1} คอลัมน์ (คาด 4)`);
  if (rows.length === 0) issues.push("ไม่พบแถว");
  pages.push({ n, png, W, H, vx, hy, rows, partialH, issues });
  console.log(`p${n}: cols=${vx.length - 1} rows=${rows.length} partialLines=${partialH}${issues.length ? "  ⚠ " + issues.join(", ") : ""}`);
}

const INK_EMPTY = 0.004;
const totalRows = pages.reduce((s, p) => s + p.rows.length, 0);
const html = `<!doctype html><meta charset="utf-8"><title>PROTOTYPE scanned SOC grid</title>
<style>body{font:14px Tahoma,sans-serif;margin:16px}.pg{position:relative;display:inline-block;border:1px solid #999;margin:8px 0}
.pg img{display:block;max-width:100%}.r{position:absolute;border:2px solid rgba(220,0,0,.7);box-sizing:border-box}
.c{position:absolute;top:0;bottom:0;border-left:1px dashed rgba(0,90,255,.8)}.lbl{position:absolute;left:-2px;top:-2px;background:#d00;color:#fff;font-size:11px;padding:0 3px}
.e{background:rgba(0,0,0,.06)}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:2px 6px}.bad{color:#b00;font-weight:bold}</style>
<h1>PROTOTYPE: ตัดแถว/ช่องจาก PDF สแกน (ไม่ใช้ OCR)</h1>
<p>${pdfPath} — หน้า ${first}–${last}, ทั้งหมด ${totalRows} แถว. กรอบแดง = แถว, เส้นประน้ำเงิน = คอลัมน์, ช่องเทา = ช่องว่าง (ไม่มีหมึก)</p>
<table><tr><th>หน้า</th><th>คอลัมน์</th><th>แถว</th><th>เส้นแนวนอนสั้น (ไม่นับเป็นขอบแถว)</th><th>ปัญหา</th></tr>
${pages.map((p) => `<tr><td><a href="#p${p.n}">${p.n}</a></td><td>${p.vx.length - 1}</td><td>${p.rows.length}</td><td>${p.partialH}</td><td class="bad">${p.issues.join(", ")}</td></tr>`).join("")}</table>
${pages.map((p) => `<h2 id="p${p.n}">หน้า ${p.n}</h2><div class="pg" style="width:${p.W}px"><img src="${p.png}">
${p.rows.map((r, i) => `<div class="r" style="left:${p.vx[0]}px;top:${r.top}px;width:${p.vx.at(-1) - p.vx[0]}px;height:${r.bottom - r.top}px"><span class="lbl">${i + 1}</span>
${r.cells.map((c) => `<div class="${c.ink < INK_EMPTY ? "c e" : "c"}" style="left:${c.left - p.vx[0]}px;width:${c.right - c.left}px"></div>`).join("")}</div>`).join("")}</div>`).join("\n")}`;
writeFileSync(path.join(outDir, "index.html"), html);
// grid.json: column lines and body rows per page (DPI px), for OCR that returns
// word boxes (PROTOTYPE_gcv.mjs places each word into its cell).
writeFileSync(path.join(outDir, "grid.json"), JSON.stringify(pages.map((p) => ({
  page: p.n, dpi: DPI, vx: p.vx, rows: p.rows.slice(1).map((r) => [r.top, r.bottom]),
}))));
console.log(`\n${pages.length} pages, ${totalRows} rows → ${path.resolve(outDir, "index.html")}`);
