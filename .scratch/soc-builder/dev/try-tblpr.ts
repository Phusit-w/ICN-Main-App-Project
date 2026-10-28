// DEV ONLY: copy a draft with the first table's <w:tblPr> replaced by that of another docx (to see whether table properties explain a shift).
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/try-tblpr.ts <draft.docx> <realSoc.docx> <out.docx>
import { readFileSync, writeFileSync } from "node:fs";
import { readZip, writeZip } from "@/lib/zip";

const [draft, real, out] = process.argv.slice(2);
const docXml = (file: string) => readZip(readFileSync(file)).find((e) => e.name === "word/document.xml")!.data.toString("utf8");
const tblPr = (xml: string) => /<w:tblPr>[\s\S]*?<\/w:tblPr>/.exec(xml.slice(xml.indexOf("<w:tbl>")))![0];
const entries = readZip(readFileSync(draft));
const xml = docXml(draft);
const start = xml.indexOf("<w:tbl>");
const patched = xml.slice(0, start) + xml.slice(start).replace(/<w:tblPr>[\s\S]*?<\/w:tblPr>/, tblPr(docXml(real)));
writeFileSync(out, writeZip(entries.map((e) => (e.name === "word/document.xml" ? { ...e, data: Buffer.from(patched, "utf8") } : e))));
console.log("tblPr now:", tblPr(patched).slice(0, 300));
