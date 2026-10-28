// DEV ONLY: write a small PDF with pages from..to of a big TOR, for the browser check upload (10 MB limit).
import * as mupdf from "mupdf";
import fs from "node:fs";
const [src, out, from, to] = process.argv.slice(2);
const d = mupdf.Document.openDocument(fs.readFileSync(src), "application/pdf");
console.log("pages", d.countPages());
const pdf = d.asPDF();
for (let i = pdf.countPages() - 1; i >= 0; i--) if (i + 1 < +from || i + 1 > +to) pdf.deletePage(i);
fs.writeFileSync(out, pdf.saveToBuffer("garbage,compress").asUint8Array());
for (let i = 0; i < pdf.countPages(); i += 5) console.log(i + 1, pdf.loadPage(i).toStructuredText().asText().slice(0, 60).replace(/\n/g, " "));
