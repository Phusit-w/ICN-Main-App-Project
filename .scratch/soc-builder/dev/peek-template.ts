// DEV ONLY: per row of the first table of a .docx: cell count, shading, bold, widths, height.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/peek-template.ts <file.docx> [rows]
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";

const short = path.resolve(".scratch/soc-builder/dev/_peek.docx");
copyFileSync(`\\\\?\\${path.resolve(process.argv[2])}`, short);
const xml = readZip(readFileSync(short)).find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const text = (s: string) => [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const rows = xml.slice(xml.indexOf("<w:tbl>")).split(/<w:tr[ >]/).slice(1, Number(process.argv[3] ?? 8) + 1);
rows.forEach((row, i) => {
  const cells = row.split(/<w:tc>/).slice(1);
  const fills = cells.map((c) => /<w:shd [^>]*w:fill="([^"]*)"/.exec(c)?.[1] ?? "-").join(",");
  const widths = cells.map((c) => /<w:tcW [^>]*w:w="(\d+)"/.exec(c)?.[1] ?? "?").join(",");
  const bold = cells.filter((c) => /<w:b\/>|<w:b /.test(c)).length;
  const span = cells.map((c) => /<w:gridSpan w:val="(\d+)"/.exec(c)?.[1] ?? "1").join(",");
  const trPr = /<w:trPr>([\s\S]*?)<\/w:trPr>/.exec(row)?.[1] ?? "";
  console.log(`row ${i + 1}: cells=${cells.length} span=${span} fill=${fills} w=${widths} boldCells=${bold} text=${JSON.stringify(text(row).slice(0, 25))} trPr=${trPr.slice(0, 60)}`);
});
