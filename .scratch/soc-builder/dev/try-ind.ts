// DEV ONLY: copy a docx with the first body table's tblInd set to a value. Run: node --import ./test/register.mjs try-ind.ts <in.docx> <out.docx> <twips>
import { readFileSync, writeFileSync } from "node:fs";
import { readZip, writeZip } from "@/lib/zip";

const [input, out, twips] = process.argv.slice(2);
const entries = readZip(readFileSync(input));
writeFileSync(out, writeZip(entries.map((e) => (e.name === "word/document.xml" ? { ...e, data: Buffer.from(e.data.toString("utf8").replace(/(<w:tblInd w:w=")-?\d+(")/, `$1${twips}$2`), "utf8") } : e))));
