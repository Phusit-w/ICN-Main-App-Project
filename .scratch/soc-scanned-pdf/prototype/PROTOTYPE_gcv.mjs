// PROTOTYPE: Google Cloud Vision DOCUMENT_TEXT_DETECTION, one call per page;
// each word goes into the grid cell holding its centre (grid.json from
// PROTOTYPE_grid.mjs). Writes cells.json {"cell-PPP-RR-C.png": text} like the
// Typhoon prototype, plus raw-PPP.json answers.
// node PROTOTYPE_gcv.mjs <scan.pdf> <grid.json> <out dir> <pages e.g. 1-10,49,68>
// API key: file named in GCV_KEY_FILE.
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const [pdfPath, gridPath, outDir, pageArg] = process.argv.slice(2);
const key = readFileSync(process.env.GCV_KEY_FILE, "utf8").trim();
const grid = new Map(JSON.parse(readFileSync(gridPath, "utf8")).map((g) => [g.page, g]));
const pages = pageArg.split(",").flatMap((s) => {
  const [a, b = a] = s.split("-").map(Number);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
});
const OCR_DPI = 300;
mkdirSync(outDir, { recursive: true });
const doc = mupdf.Document.openDocument(readFileSync(pdfPath), "application/pdf");

async function annotate(png) {
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{
      image: { content: Buffer.from(png).toString("base64") },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      imageContext: { languageHints: ["th", "en"] },
    }] }),
  });
  const body = await r.json();
  if (!r.ok || body.responses?.[0]?.error) throw new Error(`HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.responses[0];
}

// Words with their text (incl. the break Vision detected after each symbol)
// and box centre, in OCR pixels.
function words(resp) {
  const out = [];
  for (const pg of resp.fullTextAnnotation?.pages ?? []) for (const b of pg.blocks) for (const p of b.paragraphs) for (const w of p.words) {
    let text = "";
    for (const s of w.symbols) {
      text += s.text;
      const br = s.property?.detectedBreak?.type;
      if (br === "SPACE" || br === "SURE_SPACE" || br === "EOL_SURE_SPACE" || br === "LINE_BREAK") text += " ";
    }
    const v = w.boundingBox.vertices.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
    const xs = v.map((p) => p.x), ys = v.map((p) => p.y);
    out.push({ text, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, h: Math.max(...ys) - Math.min(...ys) });
  }
  return out;
}

// A cell's words in reading order: cluster into lines by centre y, then by x.
function cellText(ws) {
  if (!ws.length) return "";
  const hMed = [...ws].map((w) => w.h).sort((a, b) => a - b)[Math.floor(ws.length / 2)] || 20;
  const lines = [];
  for (const w of [...ws].sort((a, b) => a.y - b.y)) {
    const line = lines.at(-1);
    if (line && Math.abs(w.y - line.y) < hMed * 0.5) { line.ws.push(w); line.y = (line.y * (line.ws.length - 1) + w.y) / line.ws.length; }
    else lines.push({ y: w.y, ws: [w] });
  }
  return lines.map((l) => l.ws.sort((a, b) => a.x - b.x).map((w) => w.text).join("").trim()).join(" ").replace(/\s+/g, " ").trim();
}

const result = existsSync(path.join(outDir, "cells.json")) ? JSON.parse(readFileSync(path.join(outDir, "cells.json"), "utf8")) : {};
const started = Date.now();
await Promise.all(pages.map(async (n) => {
  const g = grid.get(n);
  if (!g) { console.log(`p${n}: not in grid.json`); return; }
  const png = doc.loadPage(n - 1).toPixmap(mupdf.Matrix.scale(OCR_DPI / 72, OCR_DPI / 72), mupdf.ColorSpace.DeviceGray, false).asPNG();
  const t0 = Date.now();
  const resp = await annotate(png);
  writeFileSync(path.join(outDir, `raw-${String(n).padStart(3, "0")}.json`), JSON.stringify(resp));
  const k = OCR_DPI / g.dpi;
  const ws = words(resp);
  let placed = 0;
  g.rows.forEach(([top, bottom], r) => {
    for (let c = 0; c + 1 < g.vx.length; c++) {
      const inCell = ws.filter((w) => w.x >= g.vx[c] * k && w.x < g.vx[c + 1] * k && w.y >= top * k && w.y < bottom * k);
      placed += inCell.length;
      const text = cellText(inCell);
      if (text) result[`cell-${String(n).padStart(3, "0")}-${String(r + 1).padStart(2, "0")}-${c + 1}.png`] = text;
    }
  });
  console.log(`p${n}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${ws.length} words, ${placed} in table cells`);
}));
writeFileSync(path.join(outDir, "cells.json"), JSON.stringify(result, null, 1));
console.log(`${pages.length} pages, ${((Date.now() - started) / 1000).toFixed(1)} s total`);
