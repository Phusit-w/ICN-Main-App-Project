// DEV ONLY: how rows LOOK in the real SOC and in a draft: cells, spans, bold, item and text start.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/compare-look.ts <file.docx> <from> <to>
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";

const short = path.resolve(".scratch/soc-builder/dev/_look.docx");
copyFileSync(`\\\\?\\${path.resolve(process.argv[2])}`, short);
const xml = readZip(readFileSync(short)).find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const text = (s: string) => [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const [from, to] = [Number(process.argv[3]), Number(process.argv[4])];
const rows = xml.slice(xml.indexOf("<w:tbl>")).split(/<w:tr[ >]/).slice(1);
console.log("total rows", rows.length);
rows.slice(from - 1, to).forEach((row, i) => {
  const cells = row.split(/<w:tc>/).slice(1);
  const desc = cells.map((c) => {
    const span = /<w:gridSpan w:val="(\d+)"/.exec(c)?.[1] ?? "1";
    const bold = /<w:b\/>|<w:b /.test(c) ? "B" : "";
    const size = /<w:sz w:val="(\d+)"/.exec(c)?.[1] ?? "";
    const font = /<w:rFonts [^>]*w:ascii="([^"]*)"/.exec(c)?.[1] ?? "";
    const jc = /<w:jc w:val="(\w+)"/.exec(c)?.[1] ?? "";
    const br = (c.match(/<w:br\/>/g) ?? []).length;
    const paras = (c.match(/<w:p[ >]/g) ?? []).length;
    return `[${span}${bold}${size ? " sz" + size : ""}${font ? " " + font : ""}${jc ? " jc" + jc : ""}${br ? " br" + br : ""}${paras > 1 ? " p" + paras : ""}:${text(c).slice(0, 18)}]`;
  });
  console.log(`${from + i}: ${desc.join(" ")}`);
});
