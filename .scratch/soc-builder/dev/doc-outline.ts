// DEV ONLY: what a .docx body holds, in order: paragraphs (text start) and tables (rows, first rows' cells), plus header/footer parts.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/doc-outline.ts <file.docx>
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";

const short = path.resolve(".scratch/soc-builder/dev/_outline.docx");
copyFileSync(`\\\\?\\${path.resolve(process.argv[2])}`, short);
const entries = readZip(readFileSync(short));
const text = (s: string) => [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const xml = entries.find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const body = xml.slice(xml.indexOf("<w:body>"));
let pos = 0;
let n = 0;
while (pos < body.length && n++ < 80) {
  const nextTbl = body.indexOf("<w:tbl>", pos);
  const nextP = body.indexOf("<w:p>", pos);
  const nextP2 = body.indexOf("<w:p ", pos);
  const p = [nextP, nextP2].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (nextTbl >= 0 && (p < 0 || nextTbl < p)) {
    const end = body.indexOf("</w:tbl>", nextTbl);
    const tbl = body.slice(nextTbl, end);
    const rows = tbl.split(/<w:tr[ >]/).slice(1);
    console.log(`TABLE rows=${rows.length} grid=${[...(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/.exec(tbl)?.[1] ?? "").matchAll(/w:w="(\d+)"/g)].map((m) => m[1]).join(" ")} first row: ${text(rows[0]).slice(0, 80)}`);
    pos = end + 8;
  } else if (p >= 0) {
    const end = body.indexOf("</w:p>", p);
    const t = text(body.slice(p, end));
    if (t.trim()) console.log(`P: ${t.slice(0, 100)}`);
    pos = end + 6;
  } else break;
}
for (const e of entries.filter((e) => /^word\/(header|footer)\d*\.xml$/.test(e.name))) console.log(e.name, "|", text(e.data.toString("utf8")).slice(0, 100));
