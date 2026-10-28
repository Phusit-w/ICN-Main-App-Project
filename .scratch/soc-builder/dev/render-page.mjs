// DEV ONLY: render page <n> (1-based) of a PDF to a PNG. Run: node render-page.mjs <in.pdf> <out.png> [page] [dpi]
import * as mupdf from "mupdf";
import fs from "node:fs";
const [src, out, page = "1", dpi = "80"] = process.argv.slice(2);
const doc = mupdf.Document.openDocument(fs.readFileSync(src), "application/pdf");
const scale = Number(dpi) / 72;
const pix = doc.loadPage(Number(page) - 1).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(out, pix.asPNG());
console.log("pages", doc.countPages(), "->", out);
