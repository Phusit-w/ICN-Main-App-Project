// DEV ONLY: tblPr of the header table and of the body table, and the compat settings, of a .docx.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/tblpr-and-compat.ts <file.docx>
import { readFileSync } from "node:fs";
import { readZip } from "@/lib/zip";

const entries = readZip(readFileSync(process.argv[2]));
const part = (name: string) => entries.find((e) => e.name === name)?.data.toString("utf8") ?? "";
const tblPr = (xml: string) => /<w:tblPr>[\s\S]*?<\/w:tblPr>/.exec(xml)?.[0];
console.log("HEADER tblPr:", tblPr(part("word/header1.xml")));
console.log("BODY   tblPr:", tblPr(part("word/document.xml")));
console.log("compat:", /<w:compat>[\s\S]*?<\/w:compat>/.exec(part("word/settings.xml"))?.[0].slice(0, 500));
console.log("sectPr:", /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(part("word/document.xml").slice(-3000))?.[0].slice(0, 400));
const styles = part("word/styles.xml");
console.log("TableNormal:", /<w:style [^>]*w:styleId="TableNormal"[\s\S]*?<\/w:style>/.exec(styles)?.[0].slice(0, 400));
