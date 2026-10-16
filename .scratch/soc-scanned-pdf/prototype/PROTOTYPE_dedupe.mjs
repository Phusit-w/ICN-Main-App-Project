// PROTOTYPE: how many cell images need OCR after dropping empty cells and
// near-duplicates. node PROTOTYPE_dedupe.mjs <folder with cell-*.png> [out.json]
// A cell is empty when its only ink is ruled-line pieces (dark runs > RUN px).
// Two cells are duplicates when their text ink, cropped to its box, has the same
// size (±3 px) and differs in < 2% of pixels.
import * as mupdf from "mupdf";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dir, outFile] = process.argv.slice(2);
const DARK = 160, RUN = 60, SIZE_TOL = 3, DIFF = 0.02;

function textInk(file) {
  const img = new mupdf.Image(readFileSync(file));
  const pix = img.toPixmap();
  const W = pix.getWidth(), H = pix.getHeight(), n = pix.getNumberOfComponents(), px = pix.getPixels();
  // Ruled lines: dark runs longer than RUN, horizontal or vertical. A scanned
  // line is tilted and a few px thick, so its ragged edge rows have short runs:
  // everything within NEAR px across a long run belongs to the line too.
  const NEAR = 4;
  const dark = (x, y) => px[(y * W + x) * n] < DARK;
  const line = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0, run = 0; x <= W; x++) {
    if (x < W && dark(x, y)) { run++; continue; }
    if (run > RUN) for (let k = x - run; k < x; k++) for (let dy = -NEAR; dy <= NEAR; dy++) if (y + dy >= 0 && y + dy < H) line[(y + dy) * W + k] = 1;
    run = 0;
  }
  for (let x = 0; x < W; x++) for (let y = 0, run = 0; y <= H; y++) {
    if (y < H && dark(x, y)) { run++; continue; }
    if (run > RUN) for (let k = y - run; k < y; k++) for (let dx = -NEAR; dx <= NEAR; dx++) if (x + dx >= 0 && x + dx < W) line[k * W + x + dx] = 1;
    run = 0;
  }
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y) && !line[y * W + x]) ink[y * W + x] = 1;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) {
    count++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (count < 40) return null; // specks only
  const w = x1 - x0 + 1, h = y1 - y0 + 1, bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bits[y * w + x] = ink[(y + y0) * W + x + x0];
  return { w, h, bits, count };
}

function differ(a, b) {
  const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
  let d = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a.bits[y * a.w + x] !== b.bits[y * b.w + x]) d++;
  return d / Math.max(a.count, b.count);
}

const files = readdirSync(dir).filter((f) => /^cell-.*\.png$/.test(f)).sort();
const groups = []; // { rep, members }
let empty = 0;
const byCol = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const f of files) {
  const t = textInk(path.join(dir, f));
  if (!t) { empty++; continue; }
  const g = groups.find((g) => Math.abs(g.rep.w - t.w) <= SIZE_TOL && Math.abs(g.rep.h - t.h) <= SIZE_TOL && differ(g.rep, t) < DIFF);
  if (g) g.members.push(f); else { groups.push({ rep: t, first: f, members: [f] }); byCol[f.at(-5)]++; }
}
const dupes = groups.reduce((s, g) => s + g.members.length - 1, 0);
console.log(`cells ${files.length}, empty ${empty}, with text ${files.length - empty}, unique ${groups.length} (duplicates ${dupes})`);
console.log("unique by column (1 TOR, 2 offer, 3 reference, 4 remark):", JSON.stringify(byCol));
console.log(`at 20 calls/min: ${(groups.length / 20).toFixed(0)} min one cell per call`);
const big = groups.filter((g) => g.members.length > 2).sort((a, b) => b.members.length - a.members.length).slice(0, 8);
for (const g of big) console.log(`  ${g.members.length}× like ${g.first}`);
if (outFile) writeFileSync(outFile, JSON.stringify(groups.map((g) => g.members), null, 1));
