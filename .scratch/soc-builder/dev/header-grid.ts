// DEV ONLY: the tables inside word/header1.xml of a .docx: grid and per-row cell widths / spans / text.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/header-grid.ts <file.docx>
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "@/lib/zip";

const short = path.resolve(".scratch/soc-builder/dev/_hdr.docx");
copyFileSync(`\\\\?\\${path.resolve(process.argv[2])}`, short);
const text = (s: string) => [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
for (const e of readZip(readFileSync(short)).filter((e) => /^word\/header\d*\.xml$/.test(e.name))) {
  const xml = e.data.toString("utf8");
  console.log("==", e.name, "tables:", (xml.match(/<w:tbl>/g) ?? []).length);
  for (const tbl of xml.split("<w:tbl>").slice(1)) {
    console.log("grid:", [...(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/.exec(tbl)?.[1] ?? "").matchAll(/w:w="(\d+)"/g)].map((m) => m[1]).join(" "), "| tblInd:", /<w:tblInd w:w="(-?\d+)"/.exec(tbl)?.[1], "| tblW:", /<w:tblW w:w="(\d+)"/.exec(tbl)?.[1]);
    for (const row of tbl.split(/<w:tr[ >]/).slice(1)) {
      console.log("  row:", row.split(/<w:tc[ >]/).slice(1).map((cell) => `${/<w:tcW\b[^>]*w:w="(\d+)"/.exec(cell)?.[1] ?? "-"}${/<w:gridSpan w:val="(\d+)"/.exec(cell) ? `s${/<w:gridSpan w:val="(\d+)"/.exec(cell)![1]}` : ""}:${text(cell).slice(0, 18)}`).join(" | "));
    }
  }
}
