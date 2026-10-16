// PROTOTYPE: pack several cell images into one ruled one-column table image, send
// it to Typhoon once, and split the returned <table> back into cells.
// node PROTOTYPE_pack.mjs <cells dir> <out dir> [maxHeight] [file prefix filter, e.g. "cell-00,cell-049,cell-068"]
// Key file: TYPHOON_KEY_FILE. Writes cells.json {file: text} and packs.json (what went where).
import * as mupdf from "mupdf";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const [dir, outDir, maxH = "2000", filter = ""] = process.argv.slice(2);
const MAX_H = Number(maxH), WIDTH = 1400, LINE = 4, PAD = 16, DARK = 160;
const key = readFileSync(process.env.TYPHOON_KEY_FILE, "utf8").trim();
const prefixes = filter ? filter.split(",") : [""];
mkdirSync(outDir, { recursive: true });

// Cells to read: skip cells whose only ink is ruled-line pieces (see PROTOTYPE_dedupe.mjs).
function load(file) {
  const pix = new mupdf.Image(readFileSync(file)).toPixmap();
  const W = pix.getWidth(), H = pix.getHeight(), px = pix.getPixels();
  let text = 0;
  for (let y = 0; y < H; y++) for (let x = 0, run = 0; x <= W; x++) {
    if (x < W && px[y * W + x] < DARK) { run++; continue; }
    if (run > 0 && run <= 25) text += run; // short runs = letters
    run = 0;
  }
  return { pix, W, H, text };
}
const files = readdirSync(dir).filter((f) => /^cell-.*\.png$/.test(f) && prefixes.some((p) => f.startsWith(p))).sort();
const cells = [];
for (const f of files) {
  const c = load(path.join(dir, f));
  if (c.text >= 300) cells.push({ f, ...c });
}

// Pack in reading order until the image would pass MAX_H. A cell taller than
// MAX_H goes alone.
const packs = [];
let cur = [], h = LINE;
for (const c of cells) {
  const ch = Math.round(c.H * Math.min(1, (WIDTH - 2 * LINE) / c.W)) + LINE;
  if (cur.length && h + ch > MAX_H) { packs.push(cur); cur = []; h = LINE; }
  cur.push(c); h += ch;
}
if (cur.length) packs.push(cur);

// A printed label "### n ###" above each cell, so the answer can be split by
// label instead of guessing from blank lines.
function label(n) {
  const doc = new mupdf.PDFDocument();
  const res = doc.addObject({ Font: { F1: doc.addSimpleFont(new mupdf.Font("Helvetica")) } });
  doc.insertPage(-1, doc.addPage([0, 0, 200, 26], 0, res, `BT /F1 18 Tf 6 7 Td (### ${n} ###) Tj ET`));
  const pix = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceGray, false);
  return { pix, W: pix.getWidth(), H: pix.getHeight() };
}
const LABELS = process.env.LABELS === "1";

function render(pack) {
  const parts = pack.flatMap((c, k) => {
    const s = Math.min(1, (WIDTH - 2 * LINE - 2 * PAD) / c.W);
    const cell = { c, s, h: Math.round(c.H * s) };
    if (!LABELS) return [cell];
    const l = label(k + 1);
    return [{ c: l, s: 1, h: l.H, noLine: true }, cell];
  });
  const H = parts.reduce((t, p) => t + p.h + LINE, LINE);
  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, WIDTH, H], false);
  out.clear(255);
  const dst = out.getPixels();
  const fill = (x, y, w, hh) => { for (let yy = y; yy < y + hh; yy++) dst.fill(0, yy * WIDTH + x, yy * WIDTH + x + w); };
  fill(0, 0, LINE, H); fill(WIDTH - LINE, 0, LINE, H); fill(0, 0, WIDTH, LINE);
  let y = LINE;
  for (const { c, s, h, noLine } of parts) {
    const src = c.pix.getPixels();
    for (let dy = 0; dy < h; dy++) {
      const sy = Math.min(c.H - 1, Math.floor(dy / s));
      for (let dx = 0; dx < Math.round(c.W * s); dx++) dst[(y + dy) * WIDTH + LINE + PAD + dx] = src[sy * c.W + Math.min(c.W - 1, Math.floor(dx / s))];
    }
    y += h;
    if (!noLine) { fill(0, y, WIDTH, LINE); y += LINE; }
  }
  return out.asPNG();
}

const PROMPT = readFileSync(new URL("./typhoon-v15-prompt.txt", import.meta.url), "utf8");
async function ocr(png) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch("https://api.opentyphoon.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "typhoon-ocr", max_tokens: 16384, temperature: 0.1, top_p: 0.6, repetition_penalty: 1.1,
        messages: [{ role: "user", content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(png).toString("base64")}` } },
        ] }],
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return body;
    await new Promise((ok) => setTimeout(ok, (Number(r.headers.get("retry-after")) || 5 * (attempt + 1)) * 1000));
  }
  return null;
}

// Split the answer: the outer table's rows, one per packed cell. Inner tables
// (a cell holding a table) are kept whole inside their cell.
function outerRows(html) {
  const start = html.indexOf("<table");
  if (start < 0) return null;
  const rows = [];
  let depth = 0, i = start, rowStart = -1;
  const re = /<(\/?)(table|tr)\b[^>]*>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html)); ) {
    const close = m[1] === "/", tag = m[2];
    if (tag === "table") { depth += close ? -1 : 1; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (!close) rowStart = re.lastIndex; else if (rowStart >= 0) { rows.push(html.slice(rowStart, m.index)); rowStart = -1; }
  }
  return rows.map((r) => r.replace(/^\s*<td[^>]*>/, "").replace(/<\/td>\s*$/, "").trim());
}

const result = {}, packLog = [];
const tokens = { prompt: 0, completion: 0 };
const started = Date.now();
for (let i = 0; i < packs.length; i += 2) {
  await Promise.all(packs.slice(i, i + 2).map(async (pack, j) => {
    const png = render(pack);
    const name = `pack-${String(i + j + 1).padStart(3, "0")}.png`;
    writeFileSync(path.join(outDir, name), png);
    const body = await ocr(png);
    const text = body?.choices?.[0]?.message?.content ?? "";
    tokens.prompt += body?.usage?.prompt_tokens ?? 0;
    tokens.completion += body?.usage?.completion_tokens ?? 0;
    const rows = outerRows(text);
    const ok = rows && rows.length === pack.length;
    packLog.push({ name, cells: pack.map((c) => c.f), rows: rows?.length ?? 0, ok, raw: ok ? undefined : text });
    if (ok) pack.forEach((c, k) => { result[c.f] = rows[k]; });
  }));
  await new Promise((ok) => setTimeout(ok, 3000)); // 20 req/min
}
writeFileSync(path.join(outDir, "cells.json"), JSON.stringify(result, null, 1));
writeFileSync(path.join(outDir, "packs.json"), JSON.stringify(packLog, null, 1));
const bad = packLog.filter((p) => !p.ok);
console.log(`${cells.length} cells in ${packs.length} calls, ${((Date.now() - started) / 1000).toFixed(0)} s, row count wrong in ${bad.length} packs (${bad.reduce((s, p) => s + p.cells.length, 0)} cells)`, JSON.stringify(tokens));
