// PROTOTYPE: read whole scanned SOC pages with the Gemini API (free tier) and save the rows.
// node PROTOTYPE_gemini.mjs <pages dir with page-PPP.png> <out dir> [model]
// Env: GEMINI_KEY_FILE (required), PAGES (e.g. "1,2,3,49"; default all), RPM (default 5, keep below the
// limit AI Studio shows for the model), THINKING (thinking budget; default 0 = off for speed).
// Writes <out>/page-PPP.json {rows:[[c1,c2,c3,c4],...], seconds, usage} and <out>/summary.json.
// Compare with the Typhoon per-cell reference using compare_pages.py (ocr-compare folder).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const [pagesDir, outDir, model = "gemini-2.5-flash"] = process.argv.slice(2);
const key = readFileSync(process.env.GEMINI_KEY_FILE, "utf8").trim();
const RPM = Number(process.env.RPM || 5);
const THINKING = Number(process.env.THINKING ?? 0);
const only = process.env.PAGES ? new Set(process.env.PAGES.split(",").map(Number)) : null;

const PROMPT = `The image is one page of a Thai bid "statement of compliance" table with 4 columns, left to right:
requirement (TOR text), offer, reference, remark.
Return JSON {"rows": [[c1, c2, c3, c4], ...]} with ONE array per table row, top to bottom, including a header row if the page has one.
Rules:
- Copy the text exactly as printed. Keep Thai numerals as Thai numerals. Do not correct spelling, do not translate, do not summarise.
- Do not add any text that is not in the image. If a cell is empty use "".
- A table drawn inside a cell becomes lines inside that cell, joined with "\\n", one line per inner row, inner columns joined with " | ".
- A cell that contains only a picture is "[figure]".
- A row split across a page break stays as its own row on this page.
- Do not merge two table rows into one and do not split one row into two.`;

// PER_CALL pages go in one request (the free tier allows only ~20 requests a day); the answer is then
// {"pages": [{"rows": [...]}, ...]} with one entry per image, in order.
const PER_CALL = Number(process.env.PER_CALL || 1);
const MULTI = `The ${PER_CALL} images are CONSECUTIVE pages of the same table, in order. Read each page separately as described below, and return
{"pages": [{"rows": [[c1, c2, c3, c4], ...]}, ...]} with exactly one entry per image, in the same order. Never move a row from one page to another.\n\n`;

mkdirSync(outDir, { recursive: true });
const all = readdirSync(pagesDir).filter((f) => /^page-\d{3}\.png$/.test(f)).sort()
  .filter((f) => !only || only.has(Number(f.slice(5, 8))))
  .filter((f) => !existsSync(path.join(outDir, f.replace(".png", ".json"))));
const groups = [];
for (let i = 0; i < all.length; i += PER_CALL) groups.push(all.slice(i, i + PER_CALL));
const summary = [];
let last = 0;

for (const group of groups) {
  const f = group.join("+");
  const imgParts = group.map((g) => ({ inline_data: { mime_type: "image/png", data: readFileSync(path.join(pagesDir, g)).toString("base64") } }));
  const prompt = (PER_CALL > 1 ? MULTI : "") + PROMPT;
  for (let attempt = 0; attempt < 6; attempt++) {
    const gap = 60000 / RPM - (Date.now() - last);
    if (gap > 0) await new Promise((ok) => setTimeout(ok, gap));
    last = Date.now();
    const t0 = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imgParts] }],
        generationConfig: {
          temperature: 0, responseMimeType: "application/json", maxOutputTokens: 32768,
          ...(THINKING >= 0 && /2.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: THINKING } } : {}),
        },
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status >= 500) {
      console.log(f, "HTTP", r.status, JSON.stringify(body.error?.message ?? "").slice(0, 160), "attempt", attempt + 1);
      await new Promise((ok) => setTimeout(ok, 15000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) { console.log(f, "HTTP", r.status, JSON.stringify(body).slice(0, 300)); break; }
    const seconds = (Date.now() - t0) / 1000;
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let perPage = null;
    try {
      const j = JSON.parse(text);
      perPage = PER_CALL > 1 ? j.pages.map((p) => p.rows) : [j.rows];
    } catch { /* keep raw */ }
    group.forEach((g, i) => {
      const rows = perPage?.[i] ?? null;
      writeFileSync(path.join(outDir, g.replace(".png", ".json")), JSON.stringify({
        rows, raw: rows ? undefined : text, seconds: seconds / group.length, callSeconds: seconds, pagesInCall: group.length, usage: body.usageMetadata,
      }, null, 1));
    });
    summary.push({ pages: group, rows: perPage?.map((r) => r?.length), seconds, usage: body.usageMetadata,
      pagesReturned: perPage?.length });
    console.log(f, `rows per page ${JSON.stringify(perPage?.map((r) => r?.length) ?? "BAD JSON")}, ${seconds.toFixed(1)} s`, JSON.stringify(body.usageMetadata));
    break;
  }
}
writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 1));
console.log("done", summary.length, "pages");
