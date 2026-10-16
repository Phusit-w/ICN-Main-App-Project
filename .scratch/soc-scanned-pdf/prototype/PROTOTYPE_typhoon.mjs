// PROTOTYPE: send scanned SOC pages to the Typhoon OCR API and save what comes back.
// node PROTOTYPE_typhoon.mjs <scan.pdf> <out-dir> <pages e.g. 3,7,21> [model]
// The API key is read from the file named in TYPHOON_KEY_FILE (never from the command line).
// With model "list" it only prints the models the key can use.
import * as mupdf from "mupdf";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const [pdfPath, outDir, pageList, model = "typhoon-ocr"] = process.argv.slice(2);
const key = readFileSync(process.env.TYPHOON_KEY_FILE, "utf8").trim();
const BASE = "https://api.opentyphoon.ai/v1";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

if (model === "list") {
  const r = await fetch(`${BASE}/models`, { headers });
  console.log(r.status, await r.text());
  process.exit(0);
}

const PROMPT =
  "Extract all text from the image.\n" +
  "- Output tables as HTML <table> with one <tr> per table row and one <td> per cell; keep empty cells.\n" +
  "- Keep Thai digits as written.\n" +
  "- Do not add text that is not in the image.";
const LONG_SIDE = 1800; // Typhoon OCR is trained on pages of about this size

async function ocr(prompt, png) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model, max_tokens: 16384, temperature: 0.1, top_p: 0.6, repetition_penalty: 1.2,
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(png).toString("base64")}` } },
      ] }],
    }),
  });
  return { ok: r.ok, status: r.status, body: await r.json() };
}

// Cells mode: CELLS_DIR holds cell-PPP-RR-C.png (PROTOTYPE_grid.mjs CELL_PNGS=1).
// Each cell is sent alone with Typhoon's own v1.5 prompt (from the typhoon-ocr
// package 0.4.1), 8 calls at a time. Writes cells.json {file: text}.
if (process.env.CELLS_DIR) {
  const { readdirSync } = await import("node:fs");
  const V15 = `Extract all text from the image.


Instructions:
- Only return the clean Markdown.
- Do not include any explanation or extra text.
- You must include all information on the page.


Formatting Rules:
- Tables: Render tables using <table>...</table> in clean HTML format.
- Equations: Render equations using LaTeX syntax with inline ($...$) and block ($$...$$).
- Images/Charts/Diagrams: Wrap any clearly defined visual areas (e.g. charts, diagrams, pictures) in:


<figure>
Describe the image's main elements (people, objects, text), note any contextual clues (place, event, culture), mention visible text and its meaning, provide deeper analysis when relevant (especially for financial charts, graphs, or documents), comment on style or architecture if relevant, then give a concise overall summary. Describe in Thai.
</figure>


- Page Numbers: Wrap page numbers in <page_number>...</page_number> (e.g., <page_number>14</page_number>).
- Checkboxes: Use ☐ for unchecked and ☑ for checked boxes.
    `;
  const files = readdirSync(process.env.CELLS_DIR).filter((f) => /^cell-.*\.png$/.test(f)).sort();
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "cells.json");
  const { existsSync } = await import("node:fs");
  const result = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
  const todo = files.filter((f) => !(f in result));
  const PAR = Number(process.env.PAR || 2);
  const tokens = { prompt: 0, completion: 0, failed: 0 };
  const started = Date.now();
  const one = async (f) => {
    const png = readFileSync(path.join(process.env.CELLS_DIR, f));
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers,
        body: JSON.stringify({
          model, max_tokens: 4096, temperature: 0.1, top_p: 0.6, repetition_penalty: 1.1,
          messages: [{ role: "user", content: [
            { type: "text", text: V15 },
            { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(png).toString("base64")}` } },
          ] }],
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        tokens.prompt += body.usage?.prompt_tokens ?? 0;
        tokens.completion += body.usage?.completion_tokens ?? 0;
        result[f] = body.choices[0].message.content;
        return;
      }
      const wait = Number(r.headers.get("retry-after")) || 5 * (attempt + 1);
      if (r.status !== 429) console.log(f, "HTTP", r.status, "attempt", attempt + 1);
      await new Promise((ok) => setTimeout(ok, wait * 1000));
    }
    tokens.failed++;
  };
  for (let i = 0; i < todo.length; i += PAR) await Promise.all(todo.slice(i, i + PAR).map(one));
  writeFileSync(outFile, JSON.stringify(result, null, 1));
  console.log(`${todo.length} cells sent, ${Object.keys(result).length}/${files.length} done, ${((Date.now() - started) / 1000).toFixed(0)} s`, JSON.stringify(tokens));
  process.exit(0);
}

// Rows mode: <pdf> is a folder of row-PPP-RR.png made by PROTOTYPE_grid.mjs (ROW_PNGS=1).
// Each image is one table row; 4 rows are sent at a time.
if (process.env.ROWS_DIR) {
  const { readdirSync } = await import("node:fs");
  const ROW_PROMPT =
    "The image is ONE row of a table with exactly 4 columns, separated by vertical lines: " +
    "requirement, offer, reference, remark. Output exactly one HTML <tr> with exactly 4 <td>, " +
    "keep empty cells, keep Thai digits as written, keep line breaks inside a cell as <br>. " +
    "A cell may contain a small table: write it as plain text lines. Do not add text that is not in the image.";
  const files = readdirSync(process.env.ROWS_DIR).filter((f) => /^row-\d{3}-\d{2}\.png$/.test(f)).sort();
  mkdirSync(outDir, { recursive: true });
  const out = [];
  let tokens = { prompt: 0, completion: 0 };
  const started = Date.now();
  for (let i = 0; i < files.length; i += 4) {
    const batch = files.slice(i, i + 4);
    const res = await Promise.all(batch.map((f) => ocr(ROW_PROMPT, readFileSync(path.join(process.env.ROWS_DIR, f)))));
    res.forEach((r, j) => {
      if (!r.ok) { console.log(batch[j], "HTTP", r.status, JSON.stringify(r.body).slice(0, 200)); return; }
      tokens.prompt += r.body.usage?.prompt_tokens ?? 0;
      tokens.completion += r.body.usage?.completion_tokens ?? 0;
      out.push(`<!-- ${batch[j]} -->\n${r.body.choices[0].message.content}`);
    });
  }
  writeFileSync(path.join(outDir, "rows.html"), `<meta charset="utf-8"><style>td{border:1px solid #999;vertical-align:top}</style><table>\n${out.join("\n")}\n</table>`);
  console.log(`${files.length} rows, ${((Date.now() - started) / 1000).toFixed(0)} s`, JSON.stringify(tokens));
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const doc = mupdf.Document.openDocument(readFileSync(pdfPath), "application/pdf");
const usage = [];
for (const n of pageList.split(",").map(Number)) {
  const page = doc.loadPage(n - 1);
  const [x0, y0, x1, y1] = page.getBounds();
  const scale = LONG_SIDE / Math.max(x1 - x0, y1 - y0);
  const png = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false).asPNG();
  const started = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.2,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(png).toString("base64")}` } },
      ] }],
    }),
  });
  const body = await r.json();
  const name = `typhoon-${String(n).padStart(3, "0")}`;
  writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(body, null, 2));
  if (!r.ok) { console.log(`p${n}: HTTP ${r.status}`, JSON.stringify(body).slice(0, 300)); continue; }
  writeFileSync(path.join(outDir, `${name}.html`), `<meta charset="utf-8"><style>td{border:1px solid #999;vertical-align:top}</style>${body.choices[0].message.content}`);
  usage.push({ page: n, seconds: (Date.now() - started) / 1000, ...body.usage });
  console.log(`p${n}: ${((Date.now() - started) / 1000).toFixed(1)} s`, JSON.stringify(body.usage));
}
writeFileSync(path.join(outDir, "usage.json"), JSON.stringify(usage, null, 2));
