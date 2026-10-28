// DEV ONLY: the grid of the first table of a .docx: tblGrid, and per row the cells' width / span / vMerge / text start.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/grid-dump.ts <file.docx> <from> <to>
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";

const short = path.resolve(".scratch/soc-builder/dev/_grid.docx");
copyFileSync(`\\\\?\\${path.resolve(process.argv[2])}`, short);
const xml = readZip(readFileSync(short)).find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const text = (s: string) => [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const table = xml.slice(xml.indexOf("<w:tbl>"));
console.log("tblPr:", /<w:tblPr>[\s\S]*?<\/w:tblPr>/.exec(table)?.[0].slice(0, 400));
console.log("grid:", [...(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/.exec(table)?.[1] ?? "").matchAll(/w:w="(\d+)"/g)].map((m) => m[1]).join(" "));
const [from, to] = [Number(process.argv[3]), Number(process.argv[4])];
table.split(/<w:tr[ >]/).slice(1).slice(from - 1, to).forEach((row, i) => {
  const cells = row.split(/<w:tc[ >]/).slice(1).map((cell) => {
    const w = /<w:tcW\b[^>]*w:w="(\d+)"/.exec(cell)?.[1] ?? "-";
    const span = /<w:gridSpan w:val="(\d+)"/.exec(cell)?.[1] ?? "";
    const v = /<w:vMerge\b[^>]*\/>/.test(cell) ? "vM" : "";
    const borders = /<w:tcBorders>[\s\S]*?<\/w:tcBorders>/.exec(cell) ? "B" : "";
    return `${w}${span ? `s${span}` : ""}${v}${borders}:${text(cell).slice(0, 14)}`;
  });
  console.log(`${from + i}: ${/<w:trPr>[\s\S]*?<\/w:trPr>/.exec(row)?.[0].replace(/<\/?w:trPr>/g, "").slice(0, 80) ?? ""} | ${cells.join(" | ")}`);
});
