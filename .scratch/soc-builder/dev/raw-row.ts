// DEV ONLY: the raw XML of one row (1-based) of the first table of a .docx. Run: node --import ./test/register.mjs raw-row.ts <file.docx> <row>
import { readFileSync } from "node:fs";
import { readZip } from "@/lib/zip";

const xml = readZip(readFileSync(process.argv[2])).find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const rows = xml.slice(xml.indexOf("<w:tbl>")).split(/<w:tr[ >]/).slice(1);
console.log("<w:tr " + rows[Number(process.argv[3]) - 1].slice(0, 1500));
