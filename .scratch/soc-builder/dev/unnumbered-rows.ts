// DEV ONLY: the rows of a real SOC whose item cell is empty or not an item number, with the row before.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/unnumbered-rows.ts <file.docx>
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";

const short = path.resolve(".scratch/soc-builder/dev/_look.docx");
copyFileSync(`\\\\?\\${path.resolve(process.argv[2])}`, short);
const xml = readZip(readFileSync(short)).find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const text = (s: string) => [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const rows = xml.slice(xml.indexOf("<w:tbl>")).split(/<w:tr[ >]/).slice(1).map((row) => row.split(/<w:tc[ >]/).slice(1).map(text));
const isItem = (cell: string) => /^[0-9๐-๙]+(\.[0-9๐-๙]+)*\.?$/.test(cell.trim());
rows.forEach((cells, i) => {
  if (isItem(cells[0] ?? "")) return;
  console.log(`${i + 1} [${cells.length} cells] item="${cells[0]}" | ${cells.slice(1).join(" | ").slice(0, 110)}`);
  const prev = rows[i - 1];
  if (prev) console.log(`     prev: ${prev[0]} | ${(prev[1] ?? "").slice(-70)}`);
});
